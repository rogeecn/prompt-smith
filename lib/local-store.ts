"use client";

import {
  ArtifactSchema,
  ArtifactUpdateSchema,
  ArtifactVariablesSchema,
  DraftAnswerSchema,
  HistoryItemSchema,
  OutputFormatSchema,
  QuestionSchema,
  type Artifact,
  type DraftAnswer,
  type HistoryItem,
  type OutputFormat,
  type SessionState,
} from "./schemas";
import { deriveTitleFromPrompt, parseTemplateVariables } from "./template";

const STORAGE_KEY = "prompt_smith_local_db_v1";

type LocalProject = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type LocalSession = {
  id: string;
  projectId: string;
  created_at: string;
  history: HistoryItem[];
  state: SessionState | null;
};

type LocalArtifact = Artifact & {
  projectId: string;
  created_at: string;
  updated_at: string;
};

type LocalArtifactSession = {
  id: string;
  artifactId: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  history: HistoryItem[];
};

type LocalStore = {
  projects: LocalProject[];
  sessions: LocalSession[];
  artifacts: LocalArtifact[];
  artifactSessions: LocalArtifactSession[];
};

type ProjectExportPayload = {
  version: 1;
  exported_at: string;
  project: LocalProject;
  sessions: LocalSession[];
  artifacts: LocalArtifact[];
  artifactSessions: LocalArtifactSession[];
};

const emptyStore: LocalStore = {
  projects: [],
  sessions: [],
  artifacts: [],
  artifactSessions: [],
};

const ensureBrowserStorage = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("Browser storage not available");
  }
};

const loadStore = (): LocalStore => {
  if (typeof window === "undefined") {
    return emptyStore;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore;
    const parsed = JSON.parse(raw) as Partial<LocalStore>;
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
      artifactSessions: Array.isArray(parsed.artifactSessions)
        ? parsed.artifactSessions
        : [],
    };
  } catch {
    return emptyStore;
  }
};

const saveStore = (next: LocalStore) => {
  ensureBrowserStorage();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

const updateStore = (updater: (store: LocalStore) => LocalStore) => {
  const current = loadStore();
  const next = updater(current);
  saveStore(next);
  return next;
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatSessionSummary = (history: HistoryItem[]) => {
  if (history.length === 0) return "未开始";
  const content = history[history.length - 1]?.content?.trim() ?? "";
  if (!content) return "未开始";
  return content.length > 36 ? `${content.slice(0, 36)}…` : content;
};

const normalizeDraftAnswers = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const next: Record<string, DraftAnswer> = {};

  Object.entries(record).forEach(([key, entry]) => {
    if (typeof entry === "string") {
      next[key] = { type: "text", value: entry };
      return;
    }
    if (Array.isArray(entry) && entry.every((item) => typeof item === "string")) {
      next[key] = { type: "multi", value: entry };
      return;
    }
    const parsed = DraftAnswerSchema.safeParse(entry);
    if (parsed.success) {
      next[key] = parsed.data;
    }
  });

  return next;
};

const normalizeSessionState = (value: unknown): SessionState => {
  const empty: SessionState = {
    questions: [],
    deliberations: [],
    final_prompt: null,
    is_finished: false,
    target_model: null,
    model_id: null,
    output_format: null,
    title: null,
    draft_answers: {},
  };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return empty;
  }

  const record = value as Record<string, unknown>;
  const questions = Array.isArray(record.questions)
    ? record.questions
        .map((item) => QuestionSchema.safeParse(item))
        .filter((parsed) => parsed.success)
        .map((parsed) => parsed.data)
    : [];
  const deliberations = Array.isArray(record.deliberations)
    ? record.deliberations
        .map((item) => item)
        .filter(Boolean)
    : [];
  const outputFormatParsed = OutputFormatSchema.safeParse(record.output_format);

  return {
    questions,
    deliberations,
    final_prompt:
      typeof record.final_prompt === "string" ? record.final_prompt : null,
    is_finished: typeof record.is_finished === "boolean" ? record.is_finished : false,
    target_model: typeof record.target_model === "string" ? record.target_model : null,
    model_id: typeof record.model_id === "string" ? record.model_id : null,
    output_format: outputFormatParsed.success ? outputFormatParsed.data : null,
    title: typeof record.title === "string" ? record.title : null,
    draft_answers: normalizeDraftAnswers(record.draft_answers),
  };
};

const normalizeArtifact = (value: unknown) => {
  const parsed = ArtifactSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const listProjects = async () => {
  const store = loadStore();
  return [...store.projects].sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export const createProject = async (payload: {
  name: string;
  description?: string;
}) => {
  const name = payload.name.trim();
  if (!name) {
    throw new Error("项目名称不能为空");
  }
  const id = createId();
  const nextProject: LocalProject = {
    id,
    name,
    description: payload.description?.trim() || null,
    created_at: new Date().toISOString(),
  };
  updateStore((store) => ({
    ...store,
    projects: [nextProject, ...store.projects],
  }));
  return id;
};

export const exportProject = async (projectId: string): Promise<ProjectExportPayload> => {
  const store = loadStore();
  const project = store.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  const sessions = store.sessions.filter((session) => session.projectId === projectId);
  const artifacts = store.artifacts.filter((artifact) => artifact.projectId === projectId);
  const artifactIdSet = new Set(artifacts.map((artifact) => artifact.id));
  const artifactSessions = store.artifactSessions.filter((session) =>
    artifactIdSet.has(session.artifactId)
  );

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    project,
    sessions,
    artifacts,
    artifactSessions,
  };
};

export const importProject = async (payload: unknown) => {
  const data = payload as ProjectExportPayload;
  if (!data || data.version !== 1 || !data.project) {
    throw new Error("无效的项目导入数据");
  }

  const newProjectId = createId();
  const project: LocalProject = {
    ...data.project,
    id: newProjectId,
  };

  const sessionIdMap = new Map<string, string>();
  const artifactIdMap = new Map<string, string>();

  const sessions = (data.sessions ?? []).map((session) => {
    const nextId = createId();
    sessionIdMap.set(session.id, nextId);
    return {
      ...session,
      id: nextId,
      projectId: newProjectId,
    };
  });

  const artifacts = (data.artifacts ?? []).map((artifact) => {
    const nextId = createId();
    artifactIdMap.set(artifact.id, nextId);
    return {
      ...artifact,
      id: nextId,
      projectId: newProjectId,
    };
  });

  const artifactSessions = (data.artifactSessions ?? []).map((session) => {
    const nextId = createId();
    return {
      ...session,
      id: nextId,
      artifactId: artifactIdMap.get(session.artifactId) ?? session.artifactId,
    };
  });

  updateStore((store) => ({
    ...store,
    projects: [project, ...store.projects],
    sessions: [...sessions, ...store.sessions],
    artifacts: [...artifacts, ...store.artifacts],
    artifactSessions: [...artifactSessions, ...store.artifactSessions],
  }));

  return newProjectId;
};

export const createSession = async (projectId: string) => {
  const id = createId();
  const nextSession: LocalSession = {
    id,
    projectId,
    created_at: new Date().toISOString(),
    history: [],
    state: null,
  };
  updateStore((store) => ({
    ...store,
    sessions: [nextSession, ...store.sessions],
  }));
  return id;
};

export const deleteSession = async (projectId: string, sessionId: string) => {
  updateStore((store) => ({
    ...store,
    sessions: store.sessions.filter(
      (session) => !(session.id === sessionId && session.projectId === projectId)
    ),
  }));
};

export const loadProjectContext = async (projectId: string) => {
  const store = loadStore();
  const sessions = store.sessions
    .filter((session) => session.projectId === projectId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const currentSession = sessions[0] ?? null;
  const history = currentSession?.history ?? [];
  const state = normalizeSessionState(currentSession?.state ?? {});

  return {
    history,
    sessions: sessions.map((session) => ({
      id: session.id,
      created_at: session.created_at,
      title: normalizeSessionState(session.state ?? {}).title,
      last_message: formatSessionSummary(session.history),
    })),
    currentSessionId: currentSession?.id ?? null,
    state,
  };
};

export const loadSessionContext = async (projectId: string, sessionId: string) => {
  const store = loadStore();
  const session = store.sessions.find(
    (item) => item.id === sessionId && item.projectId === projectId
  );
  if (!session) {
    throw new Error("Session not found");
  }
  return {
    history: session.history ?? [],
    state: normalizeSessionState(session.state ?? {}),
  };
};

export const updateSessionState = async (
  projectId: string,
  sessionId: string,
  state: SessionState
) => {
  const normalized = normalizeSessionState(state);
  updateStore((store) => ({
    ...store,
    sessions: store.sessions.map((session) =>
      session.id === sessionId && session.projectId === projectId
        ? { ...session, state: normalized }
        : session
    ),
  }));
};

export const updateSessionTitle = async (
  projectId: string,
  sessionId: string,
  title: string
) => {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Invalid session title");
  }
  updateStore((store) => ({
    ...store,
    sessions: store.sessions.map((session) => {
      if (session.id !== sessionId || session.projectId !== projectId) {
        return session;
      }
      const normalized = normalizeSessionState(session.state ?? {});
      return {
        ...session,
        state: { ...normalized, title: trimmed },
      };
    }),
  }));
  return trimmed;
};

export const updateSessionModelConfig = async (
  projectId: string,
  sessionId: string,
  modelId: string | null,
  outputFormat: OutputFormat | null
) => {
  const normalizedModel = modelId?.trim() || null;
  const normalizedFormat = OutputFormatSchema.safeParse(outputFormat).success
    ? outputFormat
    : null;
  updateStore((store) => ({
    ...store,
    sessions: store.sessions.map((session) => {
      if (session.id !== sessionId || session.projectId !== projectId) {
        return session;
      }
      const normalized = normalizeSessionState(session.state ?? {});
      return {
        ...session,
        state: {
          ...normalized,
          model_id: normalizedModel,
          target_model: normalizedModel,
          output_format: normalizedFormat,
        },
      };
    }),
  }));
};

export const updateSessionHistory = async (
  projectId: string,
  sessionId: string,
  history: HistoryItem[]
) => {
  const parsedHistory = HistoryItemSchema.array().safeParse(history);
  updateStore((store) => ({
    ...store,
    sessions: store.sessions.map((session) =>
      session.id === sessionId && session.projectId === projectId
        ? { ...session, history: parsedHistory.success ? parsedHistory.data : [] }
        : session
    ),
  }));
};

export const listArtifacts = async (projectId: string) => {
  const store = loadStore();
  return store.artifacts
    .filter((artifact) => artifact.projectId === projectId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((artifact) => ({
      ...artifact,
      variables: ArtifactVariablesSchema.parse(artifact.variables ?? []),
    }));
};

export const createArtifact = async (projectId: string) => {
  const id = createId();
  const now = new Date().toISOString();
  const artifact: LocalArtifact = {
    id,
    projectId,
    title: "未命名制品",
    problem: "请填写该制品解决的问题。",
    prompt_content:
      "你是一个专业助手。请根据用户需求给出清晰、可执行的结果。",
    variables: [],
    created_at: now,
    updated_at: now,
  };
  updateStore((store) => ({
    ...store,
    artifacts: [artifact, ...store.artifacts],
  }));
  return artifact;
};

export const createArtifactFromPrompt = async (
  projectId: string,
  promptContent: string,
  title?: string
) => {
  const trimmedPrompt = promptContent.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt content is required");
  }
  const derivedTitle =
    title?.trim() || deriveTitleFromPrompt(trimmedPrompt) || "未命名制品";
  const parsedVariables = parseTemplateVariables(trimmedPrompt);
  const variables = parsedVariables.map((variable) => ({
    key: variable.key,
    label: variable.label ?? variable.key,
    type: variable.type ?? ("string" as const),
    required: variable.required ?? true,
    placeholder: variable.placeholder,
    default: variable.default,
    options: variable.options,
    joiner: variable.joiner,
    true_label: variable.true_label,
    false_label: variable.false_label,
  }));
  const now = new Date().toISOString();
  const artifact: LocalArtifact = {
    id: createId(),
    projectId,
    title: derivedTitle,
    problem: "由最终 Prompt 导出",
    prompt_content: trimmedPrompt,
    variables,
    created_at: now,
    updated_at: now,
  };
  updateStore((store) => ({
    ...store,
    artifacts: [artifact, ...store.artifacts],
  }));
  return artifact;
};

export const updateArtifact = async (
  projectId: string,
  artifactId: string,
  payload: unknown
) => {
  const parsedPayload = ArtifactUpdateSchema.safeParse(payload);
  if (!parsedPayload.success) {
    throw new Error("Invalid payload");
  }
  let updated: LocalArtifact | null = null;
  updateStore((store) => ({
    ...store,
    artifacts: store.artifacts.map((artifact) => {
      if (artifact.id !== artifactId || artifact.projectId !== projectId) {
        return artifact;
      }
      updated = {
        ...artifact,
        ...parsedPayload.data,
        updated_at: new Date().toISOString(),
      };
      return updated;
    }),
  }));
  if (!updated) {
    throw new Error("Artifact not found");
  }
  return updated;
};

export const deleteArtifact = async (projectId: string, artifactId: string) => {
  updateStore((store) => ({
    ...store,
    artifacts: store.artifacts.filter(
      (artifact) => !(artifact.id === artifactId && artifact.projectId === projectId)
    ),
    artifactSessions: store.artifactSessions.filter(
      (session) => session.artifactId !== artifactId
    ),
  }));
};

export const loadArtifactContext = async (projectId: string, artifactId: string) => {
  const store = loadStore();
  const artifact = store.artifacts.find(
    (item) => item.id === artifactId && item.projectId === projectId
  );
  const normalized = artifact ? normalizeArtifact(artifact) : null;
  if (!normalized) {
    throw new Error("Artifact not found");
  }

  let sessions = store.artifactSessions
    .filter((session) => session.artifactId === artifactId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (sessions.length === 0) {
    const nextSession: LocalArtifactSession = {
      id: createId(),
      artifactId,
      title: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      history: [],
    };
    sessions = [nextSession];
    updateStore((current) => ({
      ...current,
      artifactSessions: [nextSession, ...current.artifactSessions],
    }));
  }

  const currentSession = sessions[0];

  return {
    artifact: normalized,
    history: currentSession.history ?? [],
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title,
      created_at: session.created_at,
      last_message: formatSessionSummary(session.history),
    })),
    currentSessionId: currentSession.id,
  };
};

export const loadArtifactSession = async (
  projectId: string,
  artifactId: string,
  sessionId: string
) => {
  const store = loadStore();
  const artifact = store.artifacts.find(
    (item) => item.id === artifactId && item.projectId === projectId
  );
  if (!artifact) {
    throw new Error("Artifact not found");
  }
  const session = store.artifactSessions.find(
    (item) => item.id === sessionId && item.artifactId === artifactId
  );
  if (!session) {
    throw new Error("Artifact session not found");
  }
  return { history: session.history ?? [] };
};

export const createArtifactSession = async (projectId: string, artifactId: string) => {
  const store = loadStore();
  const artifact = store.artifacts.find(
    (item) => item.id === artifactId && item.projectId === projectId
  );
  if (!artifact) {
    throw new Error("Artifact not found");
  }
  const session: LocalArtifactSession = {
    id: createId(),
    artifactId,
    title: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    history: [],
  };
  updateStore((current) => ({
    ...current,
    artifactSessions: [session, ...current.artifactSessions],
  }));
  return session.id;
};

export const updateArtifactSessionTitle = async (
  projectId: string,
  artifactId: string,
  sessionId: string,
  title: string
) => {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Invalid title");
  }
  updateStore((store) => ({
    ...store,
    artifactSessions: store.artifactSessions.map((session) => {
      if (session.id !== sessionId || session.artifactId !== artifactId) {
        return session;
      }
      return {
        ...session,
        title: trimmed,
        updated_at: new Date().toISOString(),
      };
    }),
  }));
};

export const deleteArtifactSession = async (
  projectId: string,
  artifactId: string,
  sessionId: string
) => {
  const store = loadStore();
  const artifact = store.artifacts.find(
    (item) => item.id === artifactId && item.projectId === projectId
  );
  if (!artifact) {
    throw new Error("Artifact not found");
  }
  updateStore((current) => ({
    ...current,
    artifactSessions: current.artifactSessions.filter(
      (session) => session.id !== sessionId
    ),
  }));
};

export const updateArtifactSessionHistory = async (
  projectId: string,
  artifactId: string,
  sessionId: string,
  history: HistoryItem[]
) => {
  const parsedHistory = HistoryItemSchema.array().safeParse(history);
  updateStore((store) => ({
    ...store,
    artifactSessions: store.artifactSessions.map((session) =>
      session.id === sessionId && session.artifactId === artifactId
        ? {
            ...session,
            history: parsedHistory.success ? parsedHistory.data : [],
            updated_at: new Date().toISOString(),
          }
        : session
    ),
  }));
};

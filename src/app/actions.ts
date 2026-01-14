"use server";

import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import {
  DeliberationStageSchema,
  DraftAnswerSchema,
  HistoryItemSchema,
  QuestionSchema,
  ArtifactVariablesSchema,
  ArtifactUpdateSchema,
  type DraftAnswer,
  type SessionState,
} from "../../lib/schemas";
import { z } from "zod";
import { deriveTitleFromPrompt, parseTemplateVariables } from "../../lib/template";

const projectIdSchema = z.string().uuid();
const sessionIdSchema = z.string().min(1);
const artifactIdSchema = z.string().min(1);
const isDebug =
  process.env.DEBUG_ACTIONS === "true" || process.env.DEBUG_ACTIONS === "1";

const formatSessionSummary = (history: unknown, state?: unknown) => {
  if (state && typeof state === "object" && !Array.isArray(state)) {
    const record = state as Record<string, unknown>;
    if (typeof record.title === "string" && record.title.trim()) {
      return record.title.trim();
    }
  }

  const parsed = HistoryItemSchema.array().safeParse(history);
  if (!parsed.success || parsed.data.length === 0) {
    return "未开始";
  }

  const last = parsed.data[parsed.data.length - 1];
  const content = last.content.trim();
  if (!content) {
    return "未开始";
  }

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
  const emptyState: SessionState = {
    questions: [],
    deliberations: [],
    final_prompt: null,
    is_finished: false,
    draft_answers: {},
  };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyState;
  }

  const record = value as Record<string, unknown>;
  const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
  const questions = rawQuestions.reduce((acc: SessionState["questions"], item) => {
    const parsed = QuestionSchema.safeParse(item);
    if (parsed.success) {
      acc.push(parsed.data);
    }
    return acc;
  }, []);

  const rawDeliberations = Array.isArray(record.deliberations)
    ? record.deliberations
    : [];
  const deliberations = rawDeliberations.reduce(
    (acc: SessionState["deliberations"], item) => {
      const parsed = DeliberationStageSchema.safeParse(item);
      if (parsed.success) {
        acc.push(parsed.data);
      }
      return acc;
    },
    []
  );

  return {
    questions,
    deliberations,
    final_prompt:
      typeof record.final_prompt === "string" ? record.final_prompt : null,
    is_finished: typeof record.is_finished === "boolean" ? record.is_finished : false,
    title: typeof record.title === "string" ? record.title : null,
    draft_answers: normalizeDraftAnswers(record.draft_answers),
  };
};

const normalizeArtifactVariables = (value: unknown) => {
  const parsed = ArtifactVariablesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};

const logDebug = (label: string, payload?: unknown) => {
  if (!isDebug) {
    return;
  }
  if (payload === undefined) {
    console.info(`[actions] ${label}`);
    return;
  }
  console.info(`[actions] ${label}`, payload);
};

export async function createProject() {
  const projectId = randomUUID();
  logDebug("createProject:start", { projectId });

  await prisma.project.create({
    data: {
      id: projectId,
      name: "默认项目",
      sessions: {
        create: {
          history: [],
        },
      },
    },
  });

  logDebug("createProject:done", { projectId });
  return projectId;
}

export async function listArtifacts(projectId: string) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  if (!parsedProjectId.success) {
    logDebug("listArtifacts:invalid", { projectId });
    throw new Error("Invalid projectId");
  }

  const artifacts = await prisma.artifact.findMany({
    where: { projectId: parsedProjectId.data },
    orderBy: { updated_at: "desc" },
    select: {
      id: true,
      title: true,
      problem: true,
      prompt_content: true,
      variables: true,
      created_at: true,
      updated_at: true,
    },
  });

  logDebug("listArtifacts:done", {
    projectId: parsedProjectId.data,
    count: artifacts.length,
  });

  return artifacts.map((artifact) => ({
    ...artifact,
    variables: normalizeArtifactVariables(artifact.variables),
  }));
}

export async function createArtifact(projectId: string) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  if (!parsedProjectId.success) {
    logDebug("createArtifact:invalid", { projectId });
    throw new Error("Invalid projectId");
  }

  const artifact = await prisma.artifact.create({
    data: {
      projectId: parsedProjectId.data,
      title: "未命名制品",
      problem: "请填写该制品解决的问题。",
      prompt_content:
        "你是一个专业助手。请根据用户需求给出清晰、可执行的结果。",
      variables: [],
    },
  });

  logDebug("createArtifact:done", { artifactId: artifact.id });
  return {
    ...artifact,
    variables: normalizeArtifactVariables(artifact.variables),
  };
}

export async function createArtifactFromPrompt(
  projectId: string,
  promptContent: string,
  title?: string
) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  if (!parsedProjectId.success) {
    logDebug("createArtifactFromPrompt:invalid", { projectId });
    throw new Error("Invalid projectId");
  }

  const trimmedPrompt = promptContent.trim();
  if (!trimmedPrompt) {
    logDebug("createArtifactFromPrompt:empty");
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

  const artifact = await prisma.artifact.create({
    data: {
      projectId: parsedProjectId.data,
      title: derivedTitle,
      problem: "由最终 Prompt 导出",
      prompt_content: trimmedPrompt,
      variables,
    },
  });

  logDebug("createArtifactFromPrompt:done", { artifactId: artifact.id });
  return {
    ...artifact,
    variables: normalizeArtifactVariables(artifact.variables),
  };
}

export async function updateArtifact(
  projectId: string,
  artifactId: string,
  payload: unknown
) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  const parsedArtifactId = artifactIdSchema.safeParse(artifactId);
  if (!parsedProjectId.success || !parsedArtifactId.success) {
    logDebug("updateArtifact:invalid", { projectId, artifactId });
    throw new Error("Invalid artifact");
  }

  const parsedPayload = ArtifactUpdateSchema.safeParse(payload);
  if (!parsedPayload.success) {
    logDebug("updateArtifact:invalid-payload", { artifactId });
    throw new Error("Invalid payload");
  }

  const artifact = await prisma.artifact.update({
    where: { id: parsedArtifactId.data },
    data: parsedPayload.data,
  });

  logDebug("updateArtifact:done", { artifactId: artifact.id });
  return {
    ...artifact,
    variables: normalizeArtifactVariables(artifact.variables),
  };
}

export async function loadArtifact(projectId: string, artifactId: string) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  const parsedArtifactId = artifactIdSchema.safeParse(artifactId);
  if (!parsedProjectId.success || !parsedArtifactId.success) {
    logDebug("loadArtifact:invalid", { projectId, artifactId });
    throw new Error("Invalid artifact");
  }

  const artifact = await prisma.artifact.findFirst({
    where: { id: parsedArtifactId.data, projectId: parsedProjectId.data },
  });

  if (!artifact) {
    logDebug("loadArtifact:not-found", { projectId, artifactId });
    throw new Error("Artifact not found");
  }

  return {
    ...artifact,
    variables: normalizeArtifactVariables(artifact.variables),
  };
}

export async function loadArtifactContext(projectId: string, artifactId: string) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  const parsedArtifactId = artifactIdSchema.safeParse(artifactId);
  if (!parsedProjectId.success || !parsedArtifactId.success) {
    logDebug("loadArtifactContext:invalid", { projectId, artifactId });
    throw new Error("Invalid artifact");
  }

  const artifact = await prisma.artifact.findFirst({
    where: { id: parsedArtifactId.data, projectId: parsedProjectId.data },
    select: {
      id: true,
      title: true,
      problem: true,
      prompt_content: true,
      variables: true,
    },
  });

  if (!artifact) {
    logDebug("loadArtifactContext:not-found", { projectId, artifactId });
    throw new Error("Artifact not found");
  }

  logDebug("loadArtifactContext:start", {
    projectId: parsedProjectId.data,
    artifactId: parsedArtifactId.data,
  });

  let sessions = await prisma.artifactSession.findMany({
    where: { artifactId: parsedArtifactId.data },
    orderBy: { created_at: "desc" },
    select: { id: true, created_at: true, history: true },
  });

  if (sessions.length === 0) {
    const session = await prisma.artifactSession.create({
      data: {
        id: randomUUID(),
        artifactId: parsedArtifactId.data,
        history: [],
      },
      select: { id: true, created_at: true, history: true },
    });
    sessions = [session];
  }

  const currentSessionId = sessions[0]?.id;
  const currentSession = await prisma.artifactSession.findFirst({
    where: { id: currentSessionId, artifactId: parsedArtifactId.data },
  });

  if (!currentSession) {
    throw new Error("Artifact session not found");
  }

  const historyResult = HistoryItemSchema.array().safeParse(currentSession.history);
  const history = historyResult.success ? historyResult.data : [];

  logDebug("loadArtifactContext:done", {
    artifactId: parsedArtifactId.data,
    historyCount: history.length,
  });

  return {
    artifact: {
      ...artifact,
      variables: normalizeArtifactVariables(artifact.variables),
    },
    history,
    sessions: sessions.map((session) => ({
      id: session.id,
      created_at: session.created_at,
      last_message: formatSessionSummary(session.history),
    })),
    currentSessionId,
  };
}

export async function loadArtifactSession(
  projectId: string,
  artifactId: string,
  sessionId: string
) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  const parsedArtifactId = artifactIdSchema.safeParse(artifactId);
  const parsedSessionId = sessionIdSchema.safeParse(sessionId);
  if (
    !parsedProjectId.success ||
    !parsedArtifactId.success ||
    !parsedSessionId.success
  ) {
    logDebug("loadArtifactSession:invalid", { projectId, artifactId, sessionId });
    throw new Error("Invalid artifact session");
  }

  const session = await prisma.artifactSession.findFirst({
    where: {
      id: parsedSessionId.data,
      artifactId: parsedArtifactId.data,
      artifact: { projectId: parsedProjectId.data },
    },
  });

  if (!session) {
    logDebug("loadArtifactSession:not-found", {
      projectId,
      artifactId,
      sessionId,
    });
    throw new Error("Artifact session not found");
  }

  const historyResult = HistoryItemSchema.array().safeParse(session.history);
  const history = historyResult.success ? historyResult.data : [];

  logDebug("loadArtifactSession:done", {
    sessionId: session.id,
    historyCount: history.length,
  });

  return { history };
}

export async function createArtifactSession(
  projectId: string,
  artifactId: string
) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  const parsedArtifactId = artifactIdSchema.safeParse(artifactId);
  if (!parsedProjectId.success || !parsedArtifactId.success) {
    logDebug("createArtifactSession:invalid", { projectId, artifactId });
    throw new Error("Invalid artifact");
  }

  const artifact = await prisma.artifact.findFirst({
    where: { id: parsedArtifactId.data, projectId: parsedProjectId.data },
  });

  if (!artifact) {
    logDebug("createArtifactSession:not-found", { projectId, artifactId });
    throw new Error("Artifact not found");
  }

  const sessionId = randomUUID();
  logDebug("createArtifactSession:start", {
    artifactId: parsedArtifactId.data,
    sessionId,
  });

  const session = await prisma.artifactSession.create({
    data: {
      id: sessionId,
      artifactId: parsedArtifactId.data,
      history: [],
    },
  });

  logDebug("createArtifactSession:done", { sessionId: session.id });
  return session.id;
}

export async function createSession(projectId: string) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  if (!parsedProjectId.success) {
    logDebug("createSession:invalid", { projectId });
    throw new Error("Invalid projectId");
  }

  const sessionId = randomUUID();
  logDebug("createSession:start", { projectId: parsedProjectId.data, sessionId });

  const session = await prisma.session.create({
    data: {
      id: sessionId,
      projectId: parsedProjectId.data,
      history: [],
    },
    select: { id: true, created_at: true, history: true, state: true },
  });

  logDebug("createSession:done", { sessionId: session.id });
  return session.id;
}

export async function deleteSession(projectId: string, sessionId: string) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  const parsedSessionId = sessionIdSchema.safeParse(sessionId);
  if (!parsedProjectId.success || !parsedSessionId.success) {
    logDebug("deleteSession:invalid", { projectId, sessionId });
    throw new Error("Invalid session");
  }

  const result = await prisma.session.deleteMany({
    where: { id: parsedSessionId.data, projectId: parsedProjectId.data },
  });

  if (result.count === 0) {
    logDebug("deleteSession:not-found", { projectId, sessionId });
    throw new Error("Session not found");
  }
}

export async function loadProjectContext(projectId: string) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  if (!parsedProjectId.success) {
    logDebug("loadProjectContext:invalid", { projectId });
    throw new Error("Invalid projectId");
  }

  const project = await prisma.project.findUnique({
    where: { id: parsedProjectId.data },
  });

  if (!project) {
    logDebug("loadProjectContext:not-found", { projectId });
    throw new Error("Project not found");
  }

  logDebug("loadProjectContext:start", { projectId: project.id });
  let sessions = await prisma.session.findMany({
    where: { projectId: project.id },
    orderBy: { created_at: "desc" },
    select: { id: true, created_at: true, history: true, state: true },
  });

  if (sessions.length === 0) {
    const session = await prisma.session.create({
      data: {
        id: randomUUID(),
        projectId: project.id,
        history: [],
      },
      select: { id: true, created_at: true, history: true },
    });
    sessions = [session];
  }

  const currentSessionId = sessions[0]?.id;
  const currentSession = await prisma.session.findFirst({
    where: { id: currentSessionId, projectId: project.id },
  });

  if (!currentSession) {
    throw new Error("Session not found");
  }

  const historyResult = HistoryItemSchema.array().safeParse(currentSession.history);
  const history = historyResult.success ? historyResult.data : [];
  const state = normalizeSessionState(currentSession.state ?? {});

  logDebug("loadProjectContext:done", {
    projectId: project.id,
    historyCount: history.length,
  });
  return {
    history,
    sessions: sessions.map((session) => ({
      id: session.id,
      created_at: session.created_at,
      last_message: formatSessionSummary(session.history, session.state),
    })),
    currentSessionId,
    state,
  };
}

export async function loadSessionContext(projectId: string, sessionId: string) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  const parsedSessionId = sessionIdSchema.safeParse(sessionId);
  if (!parsedProjectId.success || !parsedSessionId.success) {
    logDebug("loadSessionContext:invalid", { projectId, sessionId });
    throw new Error("Invalid session");
  }

  const session = await prisma.session.findFirst({
    where: { id: parsedSessionId.data, projectId: parsedProjectId.data },
  });

  if (!session) {
    logDebug("loadSessionContext:not-found", { projectId, sessionId });
    throw new Error("Session not found");
  }

  const historyResult = HistoryItemSchema.array().safeParse(session.history);
  const history = historyResult.success ? historyResult.data : [];
  const state = normalizeSessionState(session.state ?? {});

  logDebug("loadSessionContext:done", {
    sessionId: session.id,
    historyCount: history.length,
  });

  return {
    history,
    state,
  };
}

export async function updateSessionState(
  projectId: string,
  sessionId: string,
  state: SessionState
) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  const parsedSessionId = sessionIdSchema.safeParse(sessionId);
  if (!parsedProjectId.success || !parsedSessionId.success) {
    logDebug("updateSessionState:invalid", { projectId, sessionId });
    throw new Error("Invalid session");
  }

  const rawDrafts = state?.draft_answers;
  const normalizedDrafts = normalizeDraftAnswers(rawDrafts);
  logDebug("updateSessionState:save", {
    sessionId: parsedSessionId.data,
    draftCount: Object.keys(normalizedDrafts).length,
  });

  const candidate = normalizeSessionState({
    ...state,
    draft_answers: normalizedDrafts,
  });

  await prisma.session.update({
    where: { id: parsedSessionId.data },
    data: { state: candidate },
  });
}

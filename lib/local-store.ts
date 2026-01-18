import {
  ArtifactSchema,
  ArtifactVariablesSchema,
  HistoryItemSchema,
  SessionStateSchema,
  type Artifact,
  type ArtifactUpdate,
  type ArtifactVariable,
  type HistoryItem,
  type OutputFormat,
  type SessionState,
} from "./schemas";
import { deriveTitleFromPrompt, parseTemplateVariables } from "./template";

const DB_NAME = "prompt_smith_local";
const DB_VERSION = 1;

const STORE_PROJECTS = "projects";
const STORE_SESSIONS = "sessions";
const STORE_ARTIFACTS = "artifacts";
const STORE_ARTIFACT_SESSIONS = "artifactSessions";

type StoredProject = {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  current_session_id?: string | null;
};

type StoredSession = {
  id: string;
  projectId: string;
  created_at: string;
  updated_at: string;
  history: HistoryItem[];
  state: SessionState | null;
  title?: string | null;
  last_message?: string | null;
};

type StoredArtifact = {
  id: string;
  projectId: string;
  title: string;
  problem: string;
  prompt_content: string;
  variables: ArtifactVariable[];
  created_at: string;
  updated_at: string;
  current_session_id?: string | null;
};

type StoredArtifactSession = {
  id: string;
  projectId: string;
  artifactId: string;
  created_at: string;
  updated_at: string;
  history: HistoryItem[];
  title?: string | null;
  last_message?: string | null;
};

type ProjectExportPayload = {
  version: number;
  exported_at: string;
  project: StoredProject;
  sessions: StoredSession[];
  artifacts: StoredArtifact[];
  artifactSessions: StoredArtifactSession[];
};

const dbRef: { current: Promise<IDBDatabase> | null } = { current: null };

const nowIso = () => new Date().toISOString();

const bytesToUuid = (bytes: Uint8Array) => {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
};

const createId = () => {
  if (typeof crypto !== "undefined") {
    if ("randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    if ("getRandomValues" in crypto) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      return bytesToUuid(bytes);
    }
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
};

const ensureBrowser = () => {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    throw new Error("当前环境不支持 IndexedDB");
  }
};

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });

const transactionToPromise = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });

const openDb = () => {
  ensureBrowser();
  if (dbRef.current) {
    return dbRef.current;
  }

  dbRef.current = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_ARTIFACTS)) {
        const store = db.createObjectStore(STORE_ARTIFACTS, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_ARTIFACT_SESSIONS)) {
        const store = db.createObjectStore(STORE_ARTIFACT_SESSIONS, { keyPath: "id" });
        store.createIndex("artifactId", "artifactId", { unique: false });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("打开 IndexedDB 失败"));
  });

  return dbRef.current;
};

const withStore = async <T>(
  storeName: string,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore, tx: IDBTransaction) => Promise<T>
) => {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const result = await handler(store, tx);
  await transactionToPromise(tx);
  return result;
};

const withStores = async <T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  handler: (tx: IDBTransaction) => Promise<T>
) => {
  const db = await openDb();
  const tx = db.transaction(storeNames, mode);
  const result = await handler(tx);
  await transactionToPromise(tx);
  return result;
};

const sanitizeHistory = (value: unknown): HistoryItem[] => {
  if (!Array.isArray(value)) return [];
  return value.reduce<HistoryItem[]>((acc, item) => {
    const parsed = HistoryItemSchema.safeParse(item);
    if (parsed.success) acc.push(parsed.data);
    return acc;
  }, []);
};

const sanitizeSessionState = (value: unknown): SessionState | null => {
  const parsed = SessionStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const sanitizeVariables = (value: unknown): ArtifactVariable[] => {
  const parsed = ArtifactVariablesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};

const summarizeContent = (content?: string | null) => {
  if (!content) return "";
  const trimmed = content.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("__FORM__:")) return "已提交表单";
  if (trimmed.startsWith("__DELIBERATIONS__:")) return "多 Agent 评分";
  const normalized = trimmed.replace(/\s+/g, " ");
  return normalized.length > 60 ? `${normalized.slice(0, 60)}…` : normalized;
};

const defaultSessionState = (): SessionState => ({
  questions: [],
  deliberations: [],
  final_prompt: null,
  is_finished: false,
  target_model: null,
  model_id: null,
  output_format: null,
  title: null,
  draft_answers: {},
});

const toArtifact = (artifact: StoredArtifact): Artifact => ({
  id: artifact.id,
  title: artifact.title,
  problem: artifact.problem,
  prompt_content: artifact.prompt_content,
  variables: artifact.variables ?? [],
});

const getProjectRecord = async (projectId: string) =>
  withStore(STORE_PROJECTS, "readonly", (store) =>
    requestToPromise(store.get(projectId) as IDBRequest<StoredProject | undefined>)
  );

const getSessionRecord = async (sessionId: string) =>
  withStore(STORE_SESSIONS, "readonly", (store) =>
    requestToPromise(store.get(sessionId) as IDBRequest<StoredSession | undefined>)
  );

const getArtifactRecord = async (artifactId: string) =>
  withStore(STORE_ARTIFACTS, "readonly", (store) =>
    requestToPromise(store.get(artifactId) as IDBRequest<StoredArtifact | undefined>)
  );

const listSessionsForProject = async (projectId: string) =>
  withStore(STORE_SESSIONS, "readonly", async (store) => {
    const index = store.index("projectId");
    const result = await requestToPromise(
      index.getAll(projectId) as IDBRequest<StoredSession[]>
    );
    return result ?? [];
  });

const listArtifactsForProject = async (projectId: string) =>
  withStore(STORE_ARTIFACTS, "readonly", async (store) => {
    const index = store.index("projectId");
    const result = await requestToPromise(
      index.getAll(projectId) as IDBRequest<StoredArtifact[]>
    );
    return result ?? [];
  });

const listArtifactSessionsForArtifact = async (artifactId: string) =>
  withStore(STORE_ARTIFACT_SESSIONS, "readonly", async (store) => {
    const index = store.index("artifactId");
    const result = await requestToPromise(
      index.getAll(artifactId) as IDBRequest<StoredArtifactSession[]>
    );
    return result ?? [];
  });

const listArtifactSessionsForProject = async (projectId: string) =>
  withStore(STORE_ARTIFACT_SESSIONS, "readonly", async (store) => {
    const index = store.index("projectId");
    const result = await requestToPromise(
      index.getAll(projectId) as IDBRequest<StoredArtifactSession[]>
    );
    return result ?? [];
  });

export const listProjects = async () => {
  const items = await withStore(STORE_PROJECTS, "readonly", (store) =>
    requestToPromise(store.getAll() as IDBRequest<StoredProject[]>)
  );
  return (items ?? [])
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description ?? null,
      created_at: project.created_at,
    }));
};

export const getProjectSummary = async (projectId: string) => {
  const project = await getProjectRecord(projectId);
  if (!project) return null;
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    created_at: project.created_at,
  };
};

export const createProject = async (payload: {
  name: string;
  description?: string;
}) => {
  const name = payload.name.trim();
  if (!name) {
    throw new Error("项目名称不能为空");
  }
  const now = nowIso();
  const project: StoredProject = {
    id: createId(),
    name,
    description: payload.description?.trim() || null,
    created_at: now,
    updated_at: now,
    current_session_id: null,
  };
  await withStore(STORE_PROJECTS, "readwrite", (store) =>
    requestToPromise(store.put(project))
  );
  return project.id;
};

export const exportProject = async (projectId: string) => {
  const project = await getProjectRecord(projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const [sessions, artifacts, artifactSessions] = await Promise.all([
    listSessionsForProject(projectId),
    listArtifactsForProject(projectId),
    listArtifactSessionsForProject(projectId),
  ]);

  const payload: ProjectExportPayload = {
    version: 1,
    exported_at: nowIso(),
    project,
    sessions,
    artifacts,
    artifactSessions,
  };
  return payload;
};

export const importProject = async (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("导入文件格式错误");
  }

  const raw = payload as Partial<ProjectExportPayload>;
  const rawProject = raw.project as Partial<StoredProject> | undefined;
  if (!rawProject || typeof rawProject !== "object") {
    throw new Error("导入文件缺少项目信息");
  }

  const newProjectId = createId();
  const now = nowIso();
  const project: StoredProject = {
    id: newProjectId,
    name: typeof rawProject.name === "string" && rawProject.name.trim()
      ? rawProject.name.trim()
      : "导入项目",
    description:
      typeof rawProject.description === "string" && rawProject.description.trim()
        ? rawProject.description.trim()
        : null,
    created_at: now,
    updated_at: now,
    current_session_id: null,
  };

  const sessionIdMap = new Map<string, string>();
  const artifactIdMap = new Map<string, string>();
  const sessions = (raw.sessions ?? []).filter(Boolean).map((item) => {
    const rawSession = item as Partial<StoredSession>;
    const originalId = typeof rawSession.id === "string" ? rawSession.id : createId();
    const newId = createId();
    sessionIdMap.set(originalId, newId);
    const history = sanitizeHistory(rawSession.history);
    const state = sanitizeSessionState(rawSession.state);
    return {
      id: newId,
      projectId: newProjectId,
      created_at: rawSession.created_at && typeof rawSession.created_at === "string" ? rawSession.created_at : now,
      updated_at: now,
      history,
      state,
      title: typeof rawSession.title === "string" ? rawSession.title : state?.title ?? null,
      last_message: summarizeContent(history.at(-1)?.content ?? rawSession.last_message ?? ""),
    } satisfies StoredSession;
  });

  const artifacts = (raw.artifacts ?? []).filter(Boolean).map((item) => {
    const rawArtifact = item as Partial<StoredArtifact>;
    const originalId = typeof rawArtifact.id === "string" ? rawArtifact.id : createId();
    const newId = createId();
    artifactIdMap.set(originalId, newId);
    const variables = sanitizeVariables(rawArtifact.variables);
    const title =
      typeof rawArtifact.title === "string" && rawArtifact.title.trim()
        ? rawArtifact.title.trim()
        : "导入制品";
    const problem =
      typeof rawArtifact.problem === "string" && rawArtifact.problem.trim()
        ? rawArtifact.problem.trim()
        : "导入描述";
    const prompt =
      typeof rawArtifact.prompt_content === "string" && rawArtifact.prompt_content.trim()
        ? rawArtifact.prompt_content.trim()
        : "导入内容";
    return {
      id: newId,
      projectId: newProjectId,
      title,
      problem,
      prompt_content: prompt,
      variables,
      created_at: rawArtifact.created_at && typeof rawArtifact.created_at === "string" ? rawArtifact.created_at : now,
      updated_at: now,
      current_session_id: null,
    } satisfies StoredArtifact;
  });

  const artifactSessions = (raw.artifactSessions ?? [])
    .filter(Boolean)
    .map((item) => {
      const rawSession = item as Partial<StoredArtifactSession>;
      const oldArtifactId = typeof rawSession.artifactId === "string" ? rawSession.artifactId : "";
      const artifactId = artifactIdMap.get(oldArtifactId);
      if (!artifactId) return null;
      const history = sanitizeHistory(rawSession.history);
      return {
        id: createId(),
        projectId: newProjectId,
        artifactId,
        created_at:
          rawSession.created_at && typeof rawSession.created_at === "string"
            ? rawSession.created_at
            : now,
        updated_at: now,
        history,
        title: typeof rawSession.title === "string" ? rawSession.title : null,
        last_message: summarizeContent(history.at(-1)?.content ?? rawSession.last_message ?? ""),
      } satisfies StoredArtifactSession;
    })
    .filter((item): item is StoredArtifactSession => item !== null);

  const artifactSessionIndex = new Map<string, StoredArtifactSession>();
  for (const session of artifactSessions) {
    if (!artifactSessionIndex.has(session.artifactId)) {
      artifactSessionIndex.set(session.artifactId, session);
    }
  }

  const artifactsWithSessions = artifacts.map((artifact) => ({
    ...artifact,
    current_session_id: artifactSessionIndex.get(artifact.id)?.id ?? null,
  }));

  const nextCurrentSession =
    typeof rawProject.current_session_id === "string"
      ? sessionIdMap.get(rawProject.current_session_id) ?? null
      : sessions[0]?.id ?? null;

  project.current_session_id = nextCurrentSession;

  await withStores(
    [STORE_PROJECTS, STORE_SESSIONS, STORE_ARTIFACTS, STORE_ARTIFACT_SESSIONS],
    "readwrite",
    async (tx) => {
      const projectStore = tx.objectStore(STORE_PROJECTS);
      await requestToPromise(projectStore.put(project));

      const sessionStore = tx.objectStore(STORE_SESSIONS);
      for (const session of sessions) {
        await requestToPromise(sessionStore.put(session));
      }

      const artifactStore = tx.objectStore(STORE_ARTIFACTS);
      for (const artifact of artifactsWithSessions) {
        await requestToPromise(artifactStore.put(artifact));
      }

      const artifactSessionStore = tx.objectStore(STORE_ARTIFACT_SESSIONS);
      for (const session of artifactSessions) {
        await requestToPromise(artifactSessionStore.put(session));
      }
    }
  );
};

export const createSession = async (projectId: string) => {
  const project = await getProjectRecord(projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const now = nowIso();
  const session: StoredSession = {
    id: createId(),
    projectId,
    created_at: now,
    updated_at: now,
    history: [],
    state: null,
    title: null,
    last_message: "",
  };

  await withStores([STORE_PROJECTS, STORE_SESSIONS], "readwrite", async (tx) => {
    const sessionStore = tx.objectStore(STORE_SESSIONS);
    await requestToPromise(sessionStore.put(session));

    const projectStore = tx.objectStore(STORE_PROJECTS);
    await requestToPromise(
      projectStore.put({
        ...project,
        updated_at: now,
        current_session_id: session.id,
      } satisfies StoredProject)
    );
  });

  return session.id;
};

export const loadProjectContext = async (projectId: string) => {
  const project = await getProjectRecord(projectId);
  if (!project) {
    return {
      sessions: [],
      history: [],
      state: null as SessionState | null,
      currentSessionId: null as string | null,
    };
  }

  const sessions = await listSessionsForProject(projectId);
  const sortedSessions = sessions.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const summaries = sortedSessions.map((session) => ({
    id: session.id,
    created_at: session.created_at,
    last_message: session.last_message ?? summarizeContent(session.history.at(-1)?.content ?? ""),
    title: session.title ?? session.state?.title ?? null,
  }));

  const currentSessionId = project.current_session_id ?? summaries[0]?.id ?? null;
  if (!currentSessionId) {
    return { sessions: summaries, history: [], state: null, currentSessionId: null };
  }

  const currentSession = await getSessionRecord(currentSessionId);
  if (!currentSession) {
    return { sessions: summaries, history: [], state: null, currentSessionId: null };
  }

  if (project.current_session_id !== currentSessionId) {
    await withStore(STORE_PROJECTS, "readwrite", (store) =>
      requestToPromise(
        store.put({ ...project, current_session_id: currentSessionId, updated_at: nowIso() })
      )
    );
  }

  return {
    sessions: summaries,
    history: currentSession.history ?? [],
    state: currentSession.state ?? null,
    currentSessionId,
  };
};

export const loadSessionContext = async (projectId: string, sessionId: string) => {
  const session = await getSessionRecord(sessionId);
  if (!session || session.projectId !== projectId) {
    return { history: [], state: null as SessionState | null };
  }

  const project = await getProjectRecord(projectId);
  if (project && project.current_session_id !== sessionId) {
    await withStore(STORE_PROJECTS, "readwrite", (store) =>
      requestToPromise(
        store.put({ ...project, current_session_id: sessionId, updated_at: nowIso() })
      )
    );
  }

  return { history: session.history ?? [], state: session.state ?? null };
};

export const updateSessionState = async (
  projectId: string,
  sessionId: string,
  state: SessionState
) => {
  const session = await getSessionRecord(sessionId);
  if (!session || session.projectId !== projectId) return;
  const now = nowIso();
  const nextTitle = state.title ?? session.title ?? null;
  await withStore(STORE_SESSIONS, "readwrite", (store) =>
    requestToPromise(
      store.put({
        ...session,
        state,
        title: nextTitle,
        updated_at: now,
      } satisfies StoredSession)
    )
  );
};

export const updateSessionTitle = async (
  projectId: string,
  sessionId: string,
  title: string
) => {
  const session = await getSessionRecord(sessionId);
  if (!session || session.projectId !== projectId) return;
  const now = nowIso();
  const nextState = session.state ? { ...session.state, title } : null;
  await withStore(STORE_SESSIONS, "readwrite", (store) =>
    requestToPromise(
      store.put({
        ...session,
        title,
        state: nextState,
        updated_at: now,
      } satisfies StoredSession)
    )
  );
};

export const updateSessionModelConfig = async (
  projectId: string,
  sessionId: string,
  modelId: string | null,
  outputFormat: OutputFormat | null
) => {
  const session = await getSessionRecord(sessionId);
  if (!session || session.projectId !== projectId) return;
  const now = nowIso();
  const nextState = session.state ? { ...session.state } : defaultSessionState();
  nextState.model_id = modelId ?? null;
  nextState.target_model = modelId ?? null;
  nextState.output_format = outputFormat ?? null;

  await withStore(STORE_SESSIONS, "readwrite", (store) =>
    requestToPromise(
      store.put({
        ...session,
        state: nextState,
        updated_at: now,
      } satisfies StoredSession)
    )
  );
};

export const updateSessionHistory = async (
  projectId: string,
  sessionId: string,
  history: HistoryItem[]
) => {
  const session = await getSessionRecord(sessionId);
  if (!session || session.projectId !== projectId) return;
  const now = nowIso();
  const lastMessage = summarizeContent(history.at(-1)?.content ?? "");

  await withStore(STORE_SESSIONS, "readwrite", (store) =>
    requestToPromise(
      store.put({
        ...session,
        history,
        last_message: lastMessage,
        updated_at: now,
      } satisfies StoredSession)
    )
  );
};

export const listArtifacts = async (projectId: string) => {
  const items = await listArtifactsForProject(projectId);
  return items
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((artifact) => toArtifact(artifact));
};

export const createArtifact = async (projectId: string) => {
  const project = await getProjectRecord(projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const now = nowIso();
  const artifact: StoredArtifact = {
    id: createId(),
    projectId,
    title: "未命名制品",
    problem: "待补充",
    prompt_content: "待补充",
    variables: [],
    created_at: now,
    updated_at: now,
    current_session_id: null,
  };
  await withStore(STORE_ARTIFACTS, "readwrite", (store) =>
    requestToPromise(store.put(artifact))
  );
  return toArtifact(artifact);
};

export const createArtifactFromPrompt = async (projectId: string, prompt: string) => {
  const project = await getProjectRecord(projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const now = nowIso();
  const variables = parseTemplateVariables(prompt).map((variable) => ({
    key: variable.key,
    label: variable.label ?? variable.key,
    type: variable.type ?? "string",
    required: variable.required ?? true,
    placeholder: variable.placeholder,
    default: variable.default,
    options: variable.options,
    joiner: variable.joiner,
    true_label: variable.true_label,
    false_label: variable.false_label,
  }));
  const title = deriveTitleFromPrompt(prompt);
  const artifact: StoredArtifact = {
    id: createId(),
    projectId,
    title,
    problem: "由向导生成的制品",
    prompt_content: prompt,
    variables,
    created_at: now,
    updated_at: now,
    current_session_id: null,
  };
  await withStore(STORE_ARTIFACTS, "readwrite", (store) =>
    requestToPromise(store.put(artifact))
  );
  return toArtifact(artifact);
};

export const updateArtifact = async (
  projectId: string,
  artifactId: string,
  patch: ArtifactUpdate
) => {
  const artifact = await getArtifactRecord(artifactId);
  if (!artifact || artifact.projectId !== projectId) {
    throw new Error("制品不存在");
  }
  const now = nowIso();
  const next: StoredArtifact = {
    ...artifact,
    title: patch.title,
    problem: patch.problem,
    prompt_content: patch.prompt_content,
    variables: patch.variables ?? [],
    updated_at: now,
  };

  const parsed = ArtifactSchema.safeParse({
    id: next.id,
    title: next.title,
    problem: next.problem,
    prompt_content: next.prompt_content,
    variables: next.variables,
  });
  if (!parsed.success) {
    throw new Error("制品数据不合法");
  }

  await withStore(STORE_ARTIFACTS, "readwrite", (store) =>
    requestToPromise(store.put(next))
  );
  return parsed.data;
};

export const deleteArtifact = async (projectId: string, artifactId: string) => {
  await withStores([STORE_ARTIFACTS, STORE_ARTIFACT_SESSIONS], "readwrite", async (tx) => {
    const artifactStore = tx.objectStore(STORE_ARTIFACTS);
    const artifact = await requestToPromise(
      artifactStore.get(artifactId) as IDBRequest<StoredArtifact | undefined>
    );
    if (!artifact || artifact.projectId !== projectId) {
      return;
    }
    await requestToPromise(artifactStore.delete(artifactId));

    const sessionStore = tx.objectStore(STORE_ARTIFACT_SESSIONS);
    const index = sessionStore.index("artifactId");
    const sessions = await requestToPromise(
      index.getAll(artifactId) as IDBRequest<StoredArtifactSession[]>
    );
    for (const session of sessions ?? []) {
      await requestToPromise(sessionStore.delete(session.id));
    }
  });
};

export const loadArtifactContext = async (projectId: string, artifactId: string) => {
  const artifact = await getArtifactRecord(artifactId);
  if (!artifact || artifact.projectId !== projectId) {
    return {
      artifact: null,
      sessions: [],
      history: [],
      currentSessionId: null,
    };
  }

  let sessions = await listArtifactSessionsForArtifact(artifactId);
  sessions = sessions.sort((a, b) => b.created_at.localeCompare(a.created_at));

  let currentSessionId = artifact.current_session_id ?? sessions[0]?.id ?? null;
  let history: HistoryItem[] = [];

  if (!currentSessionId) {
    const newSessionId = await createArtifactSession(projectId, artifactId);
    currentSessionId = newSessionId;
    sessions = await listArtifactSessionsForArtifact(artifactId);
  }

  if (currentSessionId) {
    const session = sessions.find((item) => item.id === currentSessionId);
    history = session?.history ?? [];
  }

  const summaries = sessions.map((session) => ({
    id: session.id,
    title: session.title ?? null,
    created_at: session.created_at,
    last_message: session.last_message ?? summarizeContent(session.history.at(-1)?.content ?? ""),
  }));

  return {
    artifact: toArtifact(artifact),
    sessions: summaries,
    history,
    currentSessionId,
  };
};

export const loadArtifactSession = async (
  projectId: string,
  artifactId: string,
  sessionId: string
) => {
  const session = await withStore(STORE_ARTIFACT_SESSIONS, "readonly", (store) =>
    requestToPromise(store.get(sessionId) as IDBRequest<StoredArtifactSession | undefined>)
  );
  if (!session || session.projectId !== projectId || session.artifactId !== artifactId) {
    return { history: [] as HistoryItem[] };
  }

  const artifact = await getArtifactRecord(artifactId);
  if (artifact && artifact.current_session_id !== sessionId) {
    await withStore(STORE_ARTIFACTS, "readwrite", (store) =>
      requestToPromise(
        store.put({ ...artifact, current_session_id: sessionId, updated_at: nowIso() })
      )
    );
  }

  return { history: session.history ?? [] };
};

export const createArtifactSession = async (projectId: string, artifactId: string) => {
  const artifact = await getArtifactRecord(artifactId);
  if (!artifact || artifact.projectId !== projectId) {
    throw new Error("制品不存在");
  }
  const now = nowIso();
  const session: StoredArtifactSession = {
    id: createId(),
    projectId,
    artifactId,
    created_at: now,
    updated_at: now,
    history: [],
    title: null,
    last_message: "",
  };

  await withStores([STORE_ARTIFACT_SESSIONS, STORE_ARTIFACTS], "readwrite", async (tx) => {
    const sessionStore = tx.objectStore(STORE_ARTIFACT_SESSIONS);
    await requestToPromise(sessionStore.put(session));

    const artifactStore = tx.objectStore(STORE_ARTIFACTS);
    await requestToPromise(
      artifactStore.put({
        ...artifact,
        current_session_id: session.id,
        updated_at: now,
      } satisfies StoredArtifact)
    );
  });

  return session.id;
};

export const updateArtifactSessionTitle = async (
  projectId: string,
  artifactId: string,
  sessionId: string,
  title: string
) => {
  const session = await withStore(STORE_ARTIFACT_SESSIONS, "readonly", (store) =>
    requestToPromise(store.get(sessionId) as IDBRequest<StoredArtifactSession | undefined>)
  );
  if (!session || session.projectId !== projectId || session.artifactId !== artifactId) return;

  await withStore(STORE_ARTIFACT_SESSIONS, "readwrite", (store) =>
    requestToPromise(
      store.put({
        ...session,
        title,
        updated_at: nowIso(),
      } satisfies StoredArtifactSession)
    )
  );
};

export const deleteArtifactSession = async (
  projectId: string,
  artifactId: string,
  sessionId: string
) => {
  await withStores([STORE_ARTIFACT_SESSIONS, STORE_ARTIFACTS], "readwrite", async (tx) => {
    const sessionStore = tx.objectStore(STORE_ARTIFACT_SESSIONS);
    const session = await requestToPromise(
      sessionStore.get(sessionId) as IDBRequest<StoredArtifactSession | undefined>
    );
    if (!session || session.projectId !== projectId || session.artifactId !== artifactId) {
      return;
    }
    await requestToPromise(sessionStore.delete(sessionId));

    const artifactStore = tx.objectStore(STORE_ARTIFACTS);
    const artifact = await requestToPromise(
      artifactStore.get(artifactId) as IDBRequest<StoredArtifact | undefined>
    );
    if (artifact && artifact.current_session_id === sessionId) {
      const remainingSessions = await requestToPromise(
        sessionStore.index("artifactId").getAll(artifactId) as IDBRequest<StoredArtifactSession[]>
      );
      const nextSessionId = remainingSessions?.[0]?.id ?? null;
      await requestToPromise(
        artifactStore.put({
          ...artifact,
          current_session_id: nextSessionId,
          updated_at: nowIso(),
        } satisfies StoredArtifact)
      );
    }
  });
};

export const updateArtifactSessionHistory = async (
  projectId: string,
  artifactId: string,
  sessionId: string,
  history: HistoryItem[]
) => {
  const session = await withStore(STORE_ARTIFACT_SESSIONS, "readonly", (store) =>
    requestToPromise(store.get(sessionId) as IDBRequest<StoredArtifactSession | undefined>)
  );
  if (!session || session.projectId !== projectId || session.artifactId !== artifactId) return;

  const now = nowIso();
  const lastMessage = summarizeContent(history.at(-1)?.content ?? "");
  await withStore(STORE_ARTIFACT_SESSIONS, "readwrite", (store) =>
    requestToPromise(
      store.put({
        ...session,
        history,
        last_message: lastMessage,
        updated_at: now,
      } satisfies StoredArtifactSession)
    )
  );
};

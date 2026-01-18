"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { z } from "zod";
import { MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import ArtifactEditor from "./ArtifactEditor";
import ArtifactChat from "./ArtifactChat";
import {
  createArtifact,
  createArtifactSession,
  deleteArtifactSession,
  deleteArtifact,
  listArtifacts,
  loadArtifactContext,
  loadArtifactSession,
  updateArtifactSessionTitle,
} from "../lib/local-store";
import type { Artifact, HistoryItem } from "../lib/schemas";

const projectIdSchema = z.string().min(1);

type ArtifactsClientProps = {
  initialProjectId?: string | null;
  initialArtifactId?: string | null;
  initialSessionId?: string | null;
};

export default function ArtifactsClient({
  initialProjectId = null,
  initialArtifactId = null,
  initialSessionId = null,
}: ArtifactsClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [viewMode, setViewMode] = useState<"chat" | "edit">("chat");
  const [sessions, setSessions] = useState<
    { id: string; title?: string | null; created_at: string | Date; last_message?: string }[]
  >([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<HistoryItem[]>([]);
  const [isCreatingArtifact, setIsCreatingArtifact] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [deletingArtifactId, setDeletingArtifactId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [sessionDeleteTarget, setSessionDeleteTarget] = useState<{
    id: string;
    title?: string | null;
  } | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const requestedArtifactId = typeof initialArtifactId === "string" ? initialArtifactId : null;
  const requestedSessionId = typeof initialSessionId === "string" ? initialSessionId : null;
  const validProjectId = projectIdSchema.safeParse(initialProjectId).success
    ? initialProjectId
    : null;

  useEffect(() => {
    setProjectId(validProjectId);
  }, [validProjectId]);

  // Artifact List
  const refreshArtifacts = useCallback(async (activeProjectId: string) => {
    try {
      let items = await listArtifacts(activeProjectId);
      if (items.length === 0) {
        await createArtifact(activeProjectId);
        items = await listArtifacts(activeProjectId);
      }
      setArtifacts(items);
      setCurrentArtifactId((prev) => {
        if (requestedArtifactId && items.some((item) => item.id === requestedArtifactId)) {
          return requestedArtifactId;
        }
        return prev && items.some((item) => item.id === prev) ? prev : null;
      });
    } catch {
      // Error handling
    }
  }, [requestedArtifactId]);

  useEffect(() => {
    if (!projectId) return;
    void refreshArtifacts(projectId);
  }, [projectId, refreshArtifacts]);

  useEffect(() => {
    if (!requestedArtifactId || artifacts.length === 0) return;
    if (!artifacts.some((item) => item.id === requestedArtifactId)) return;
    setCurrentArtifactId(requestedArtifactId);
    setViewMode("chat");
  }, [artifacts, requestedArtifactId]);

  // Context Loading
  const loadContext = useCallback(async (artifactId: string) => {
    if (!projectId) return;
    setIsLoadingContext(true);
    try {
      const context = await loadArtifactContext(projectId, artifactId);
      setArtifact(context.artifact);
      setSessions(context.sessions);
      setCurrentSessionId(context.currentSessionId);
      setInitialMessages(context.history);
      if (
        requestedSessionId &&
        requestedSessionId !== context.currentSessionId &&
        context.sessions.some((session) => session.id === requestedSessionId)
      ) {
        const sessionContext = await loadArtifactSession(
          projectId,
          artifactId,
          requestedSessionId
        );
        setInitialMessages(sessionContext.history);
        setCurrentSessionId(requestedSessionId);
      }
    } finally {
      setIsLoadingContext(false);
    }
  }, [projectId, requestedSessionId]);

  useEffect(() => {
    if (!projectId || !currentArtifactId) {
      setArtifact(null);
      setSessions([]);
      setCurrentSessionId(null);
      setInitialMessages([]);
      return;
    }
    void loadContext(currentArtifactId);
  }, [projectId, currentArtifactId, loadContext]);

  // Actions
  const handleSelectArtifact = (artifactItem: Artifact) => {
    setCurrentArtifactId(artifactItem.id);
    setArtifact(artifactItem);
    setViewMode("chat");
    setIsSidebarOpen(false);
    if (projectId) {
      router.push(`/projects/${projectId}/artifacts/${artifactItem.id}`);
    }
  };

  const handleCreateArtifact = async () => {
    if (!projectId || isCreatingArtifact) return;
    setIsCreatingArtifact(true);
    try {
      const created = await createArtifact(projectId);
      const items = await listArtifacts(projectId);
      setArtifacts(items);
      setCurrentArtifactId(created.id);
      setArtifact(created);
      setViewMode("edit");
      router.push(`/projects/${projectId}/artifacts/${created.id}`);
    } finally {
      setIsCreatingArtifact(false);
    }
  };

  const handleEditArtifact = (artifactItem: Artifact) => {
    if (!projectId) return;
    setCurrentArtifactId(artifactItem.id);
    setArtifact(artifactItem);
    setViewMode("edit");
    setIsSidebarOpen(false);
  };

  const handleDeleteArtifact = (artifactItem: Artifact) => {
    if (!projectId || deletingArtifactId) return;
    setDeleteTarget({
      id: artifactItem.id,
      title: artifactItem.title || "未命名制品",
    });
  };

  const confirmDeleteArtifact = async () => {
    if (!projectId || !deleteTarget) return;
    const artifactId = deleteTarget.id;
    setDeletingArtifactId(artifactId);
    try {
      await deleteArtifact(projectId, artifactId);
      const items = await listArtifacts(projectId);
      setArtifacts(items);
      if (currentArtifactId === artifactId) {
        const nextArtifactId = items[0]?.id ?? null;
        setCurrentArtifactId(nextArtifactId);
        setViewMode("chat");
        setArtifact(items[0] ?? null);
        if (nextArtifactId) {
          router.push(`/projects/${projectId}/artifacts/${nextArtifactId}`);
        } else {
          router.push(`/projects/${projectId}/artifacts`);
        }
      }
    } finally {
      setDeletingArtifactId(null);
      setDeleteTarget(null);
    }
  };

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!projectId || !currentArtifactId || sessionId === currentSessionId) return;
      setIsLoadingContext(true);
      try {
        const context = await loadArtifactSession(projectId, currentArtifactId, sessionId);
        setInitialMessages(context.history);
        setCurrentSessionId(sessionId);
        router.push(
          `/projects/${projectId}/artifacts/${currentArtifactId}/sessions/${sessionId}`
        );
      } finally {
        setIsLoadingContext(false);
      }
    },
    [projectId, currentArtifactId, currentSessionId, router]
  );

  const handleCreateSession = useCallback(async () => {
    if (!projectId || !currentArtifactId || isCreatingSession) return;
    setIsCreatingSession(true);
    try {
      const sessionId = await createArtifactSession(projectId, currentArtifactId);
      setCurrentSessionId(sessionId);
      setInitialMessages([]);
      setSessions((prev) => [
        { id: sessionId, title: null, created_at: new Date(), last_message: "New Branch" },
        ...prev,
      ]);
      router.push(
        `/projects/${projectId}/artifacts/${currentArtifactId}/sessions/${sessionId}`
      );
    } finally {
      setIsCreatingSession(false);
    }
  }, [projectId, currentArtifactId, isCreatingSession, router]);

  const handleSessionIdChange = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    setSessions((prev) => {
      if (prev.some((item) => item.id === sessionId)) return prev;
      return [
        { id: sessionId, title: null, created_at: new Date(), last_message: "New Branch" },
        ...prev,
      ];
    });
    if (projectId && currentArtifactId) {
      router.push(
        `/projects/${projectId}/artifacts/${currentArtifactId}/sessions/${sessionId}`
      );
    }
  }, [projectId, currentArtifactId, router]);

  const handleEditSessionTitle = (sessionId: string, title?: string | null) => {
    setEditingSessionId(sessionId);
    setSessionTitleDraft(title ?? "");
  };

  const commitSessionTitle = async (sessionId: string) => {
    if (!projectId || !currentArtifactId) return;
    const trimmed = sessionTitleDraft.trim();
    if (!trimmed) {
      setSessionTitleDraft("");
      setEditingSessionId(null);
      return;
    }
    try {
      await updateArtifactSessionTitle(projectId, currentArtifactId, sessionId, trimmed);
      setSessions((prev) =>
        prev.map((item) =>
          item.id === sessionId ? { ...item, title: trimmed } : item
        )
      );
    } finally {
      setEditingSessionId(null);
    }
  };

  const handleDeleteSession = (sessionId: string, title?: string | null) => {
    setSessionDeleteTarget({ id: sessionId, title });
  };

  const confirmDeleteSession = async () => {
    if (!projectId || !currentArtifactId || !sessionDeleteTarget) return;
    setDeletingSessionId(sessionDeleteTarget.id);
    try {
      await deleteArtifactSession(projectId, currentArtifactId, sessionDeleteTarget.id);
      setSessions((prev) => prev.filter((item) => item.id !== sessionDeleteTarget.id));
      if (currentSessionId === sessionDeleteTarget.id) {
        const nextSession = sessions.find((item) => item.id !== sessionDeleteTarget.id);
        if (nextSession) {
          setCurrentSessionId(nextSession.id);
          const context = await loadArtifactSession(projectId, currentArtifactId, nextSession.id);
          setInitialMessages(context.history);
          router.push(
            `/projects/${projectId}/artifacts/${currentArtifactId}/sessions/${nextSession.id}`
          );
        } else {
          const newSessionId = await createArtifactSession(projectId, currentArtifactId);
          setCurrentSessionId(newSessionId);
          setInitialMessages([]);
          setSessions((prev) => [
            { id: newSessionId, title: null, created_at: new Date(), last_message: "New Branch" },
            ...prev,
          ]);
          router.push(
            `/projects/${projectId}/artifacts/${currentArtifactId}/sessions/${newSessionId}`
          );
        }
      }
    } finally {
      setDeletingSessionId(null);
      setSessionDeleteTarget(null);
    }
  };

  const formatDate = (value: string | Date) => {
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const currentArtifact = useMemo(
    () => artifacts.find((item) => item.id === currentArtifactId) ?? null,
    [artifacts, currentArtifactId]
  );

  const handleEditorSave = useCallback((updatedArtifact: Artifact) => {
    setArtifact(updatedArtifact);
    setArtifacts((prev) =>
      prev.map((item) => (item.id === updatedArtifact.id ? updatedArtifact : item))
    );
  }, []);

  const handleExitEditor = () => {
    setViewMode("chat");
  };

  useEffect(() => {
    if (!projectId || !currentArtifactId || !currentSessionId) return;
    if (!pathname.includes("/sessions/")) return;
    const target = `/projects/${projectId}/artifacts/${currentArtifactId}/sessions/${currentSessionId}`;
    if (pathname !== target) {
      router.replace(target);
    }
  }, [projectId, currentArtifactId, currentSessionId, pathname, router]);

  if (!projectId) {
    return (
      <div className="flex min-h-screen flex-col bg-white items-center justify-center px-6 text-center">
        <div className="font-display text-2xl text-black">请先选择一个项目</div>
        <a href="/" className="mt-4 text-sm text-black underline">
          返回项目列表
        </a>
      </div>
    );
  }

  const wizardHref = `/projects/${projectId}/wizard`;
  const artifactsHref = `/projects/${projectId}/artifacts`;
  const isWizardActive = pathname.includes("/wizard");
  const isArtifactsActive = pathname.includes("/artifacts");

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-white">
      <main className="flex flex-1 min-h-0 w-full overflow-hidden relative">
        {!isSidebarOpen && (
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center border border-gray-200 bg-white text-gray-600 lg:hidden"
            aria-label="打开侧栏"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
         {/* Sidebar Overlay */}
         {isSidebarOpen && (
          <div 
            className="absolute inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* 1. Left Sidebar: Artifact List */}
        <aside 
          className={`
            absolute inset-y-0 left-0 z-50 w-80 transform border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
            ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-gray-100 px-6 py-5">
              <div className="font-display text-lg font-bold text-black">
                PROMPT SMITH
              </div>
              <nav className="mt-4 flex flex-col gap-2 text-sm font-medium text-gray-500">
                <Link
                  href="/"
                  className={pathname === "/" ? "text-black" : "hover:text-black"}
                >
                  Projects
                </Link>
                <Link
                  href={wizardHref}
                  className={isWizardActive ? "text-black" : "hover:text-black"}
                >
                  Wizard
                </Link>
                <Link
                  href={artifactsHref}
                  className={isArtifactsActive ? "text-black" : "hover:text-black"}
                >
                  Artifacts
                </Link>
              </nav>
            </div>

            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    id="artifact-search"
                    name="artifactSearch"
                    placeholder="Search artifacts..."
                    className="w-full border-b border-gray-300 py-2 text-sm font-body outline-none focus:border-black transition-colors bg-transparent"
                  />
                  <Search className="absolute right-0 top-2 h-4 w-4 text-gray-400" />
                </div>
                <button
                  type="button"
                  onClick={handleCreateArtifact}
                  disabled={isCreatingArtifact}
                  aria-label="新建制品"
                  className="flex h-9 w-9 items-center justify-center border border-gray-200 text-gray-600 hover:text-black disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {artifacts.map((item) => {
                const isActive = item.id === currentArtifactId;
                return (
                  <div
                    key={item.id}
                    className={`
                      group flex items-start gap-2 border-b border-gray-50 p-6 transition-all duration-200
                      ${isActive ? "bg-surface-muted" : "hover:bg-gray-50"}
                    `}
                  >
                    <button onClick={() => handleSelectArtifact(item)} className="flex-1 text-left">
                      <div className={`border-l-2 pl-4 ${isActive ? "border-accent" : "border-transparent"}`}>
                        <h3 className={`font-heading font-bold text-base mb-1 ${isActive ? "text-black" : "text-gray-700"}`}>
                          {item.title || "Untitled Artifact"}
                        </h3>
                        <p className="font-body text-xs text-gray-500 line-clamp-2">
                          {item.problem || "No description provided."}
                        </p>
                      </div>
                    </button>
                    <div className="flex flex-col items-center gap-2 pt-1">
                      <button
                        type="button"
                        aria-label="编辑制品"
                        onClick={() => handleEditArtifact(item)}
                        className="text-gray-500 opacity-0 invisible group-hover:opacity-100 group-hover:visible hover:text-black transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="删除制品"
                        onClick={() => handleDeleteArtifact(item)}
                        disabled={deletingArtifactId === item.id}
                        className="text-gray-500 opacity-0 invisible group-hover:opacity-100 group-hover:visible hover:text-rose-500 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* 2. Center: Chat Area */}
        <section className="flex flex-1 flex-col overflow-hidden bg-white relative min-w-0">
          {!currentArtifactId ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              Select an artifact to view details
            </div>
          ) : viewMode === "edit" ? (
            <div className="flex-1 min-h-0">
              {artifact ?? currentArtifact ? (
                <ArtifactEditor
                  projectId={projectId as string}
                  artifact={(artifact ?? currentArtifact) as Artifact}
                  onCancel={handleExitEditor}
                  onSave={handleEditorSave}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">
                  Loading editor...
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Chat Stream */}
              <div className="flex-1 min-h-0 relative">
                {isLoadingContext ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                    <div className="font-mono text-xs">Loading context...</div>
                  </div>
                ) : currentSessionId && currentArtifactId ? (
                  <ArtifactChat
                    key={`${currentArtifactId}-${currentSessionId}`}
                    projectId={projectId as string}
                    artifactId={currentArtifactId}
                    sessionId={currentSessionId}
                    promptContent={
                      artifact?.prompt_content ??
                      currentArtifact?.prompt_content ??
                      ""
                    }
                    initialMessages={initialMessages}
                    variables={artifact?.variables ?? currentArtifact?.variables ?? []}
                    onSessionIdChange={handleSessionIdChange}
                  />
                ) : null}
              </div>
            </>
          )}
        </section>

        {/* 3. Right Sidebar: Session History & Variables */}
        {currentArtifact && viewMode !== "edit" && (
          <aside className="hidden w-[280px] shrink-0 border-l border-gray-200 bg-white flex-col lg:flex">
            
            {/* Session History */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0 border-b border-gray-200">
              <div className="p-3 border-b border-gray-100">
                <button
                  type="button"
                  onClick={handleCreateSession}
                  className="flex w-full items-center justify-center gap-2 border border-gray-200 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600 hover:text-black transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  New
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                {sessions.map((session, index) => {
                  const isActive = session.id === currentSessionId;
                  const title = session.title?.trim() || `会话 ${sessions.length - index}`;
                  return (
                    <div
                      key={session.id}
                      className={`group w-full ${isActive ? "bg-surface-muted" : ""}`}
                    >
                      <div
                        className={`
                          flex items-start gap-2 px-5 py-3 transition-all duration-200
                          ${isActive ? "" : "hover:bg-gray-50"}
                        `}
                      >
                        {editingSessionId === session.id ? (
                          <div className="flex-1 min-w-0">
                            <div className={`border-l-2 pl-3 ${isActive ? "border-accent" : "border-transparent"}`}>
                              <div className="flex items-start justify-between gap-2">
                                <input
                                  value={sessionTitleDraft}
                                  onChange={(event) => setSessionTitleDraft(event.target.value)}
                                  onBlur={() => void commitSessionTitle(session.id)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void commitSessionTitle(session.id);
                                    }
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      setEditingSessionId(null);
                                      setSessionTitleDraft(session.title ?? "");
                                    }
                                  }}
                                  className="w-full border-b border-gray-200 bg-transparent text-xs font-semibold text-gray-700 outline-none focus:border-black"
                                  placeholder="输入会话标题"
                                />
                                <span className="shrink-0 text-[10px] text-gray-400">
                                  {formatDate(session.created_at)}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-gray-500 truncate font-body">
                                {session.last_message || "Empty"}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSelectSession(session.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <div className={`border-l-2 pl-3 ${isActive ? "border-accent" : "border-transparent"}`}>
                              <div className="flex items-start justify-between gap-2">
                                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700">
                                  {title}
                                </span>
                                <span className="shrink-0 text-[10px] text-gray-400">
                                  {formatDate(session.created_at)}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-gray-500 truncate font-body">
                                {session.last_message || "Empty"}
                              </div>
                            </div>
                          </button>
                        )}
                        <div className="flex flex-col items-center gap-2 pt-1">
                          <button
                            type="button"
                            aria-label="编辑会话"
                            onClick={() => handleEditSessionTitle(session.id, session.title)}
                            className="text-gray-400 opacity-0 invisible group-hover:opacity-100 group-hover:visible hover:text-black transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="删除会话"
                            onClick={() => handleDeleteSession(session.id, session.title)}
                            disabled={deletingSessionId === session.id}
                            className="text-gray-400 opacity-0 invisible group-hover:opacity-100 group-hover:visible hover:text-rose-500 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        )}
      </main>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!deletingArtifactId) {
              setDeleteTarget(null);
            }
          }}
        >
          <div
            className="w-full max-w-md border border-gray-200 bg-white p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-bold text-black">删除制品</h3>
            <p className="mt-2 text-sm text-gray-600">
              确定要删除“{deleteTarget.title}”及其会话记录吗？此操作无法撤销。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:text-black"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingArtifactId === deleteTarget.id}
              >
                取消
              </button>
              <button
                type="button"
                className="border border-rose-500 bg-rose-500 px-4 py-2 text-sm text-white hover:bg-rose-600 disabled:opacity-60"
                onClick={confirmDeleteArtifact}
                disabled={deletingArtifactId === deleteTarget.id}
              >
                {deletingArtifactId === deleteTarget.id ? "删除中..." : "删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sessionDeleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!deletingSessionId) {
              setSessionDeleteTarget(null);
            }
          }}
        >
          <div
            className="w-full max-w-md border border-gray-200 bg-white p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-bold text-black">删除会话</h3>
            <p className="mt-2 text-sm text-gray-600">
              确定要删除“{sessionDeleteTarget.title || "未命名会话"}”吗？此操作无法撤销。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:text-black"
                onClick={() => setSessionDeleteTarget(null)}
                disabled={deletingSessionId === sessionDeleteTarget.id}
              >
                取消
              </button>
              <button
                type="button"
                className="border border-rose-500 bg-rose-500 px-4 py-2 text-sm text-white hover:bg-rose-600 disabled:opacity-60"
                onClick={confirmDeleteSession}
                disabled={deletingSessionId === sessionDeleteTarget.id}
              >
                {deletingSessionId === sessionDeleteTarget.id ? "删除中..." : "删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

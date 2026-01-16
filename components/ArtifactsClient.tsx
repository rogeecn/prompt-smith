"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  Plus,
  Search,
  Layers,
  Box,
  Trash2,
  Pencil,
  Menu,
  X,
  MessageSquare,
  RotateCw,
} from "lucide-react";
import TopNav from "./TopNav";
import ArtifactChat from "./ArtifactChat";
import {
  createArtifact,
  createArtifactSession,
  createProject,
  deleteArtifact,
  listArtifacts,
  loadArtifactContext,
  loadArtifactSession,
} from "../src/app/actions";
import type { Artifact, HistoryItem } from "../lib/schemas";

const projectIdSchema = z.string().uuid();

type ArtifactsClientProps = {
  initialProjectId?: string | null;
};

export default function ArtifactsClient({
  initialProjectId = null,
}: ArtifactsClientProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [sessions, setSessions] = useState<
    { id: string; created_at: string | Date; last_message?: string }[]
  >([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<HistoryItem[]>([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isCreatingArtifact, setIsCreatingArtifact] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isDeletingArtifactId, setIsDeletingArtifactId] = useState<string | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const hasRequestedRef = useRef(false);

  const validProjectId = projectIdSchema.safeParse(initialProjectId).success
    ? initialProjectId
    : null;

  const createAndRedirect = useCallback(async () => {
    if (isCreatingProject) return;
    setIsCreatingProject(true);
    setError(null);
    try {
      const newProjectId = await createProject();
      setProjectId(newProjectId);
      router.replace(`/artifacts?projectId=${newProjectId}`);
    } catch {
      setError("创建项目失败，请重试。");
    } finally {
      setIsCreatingProject(false);
    }
  }, [isCreatingProject, router]);

  useEffect(() => {
    if (validProjectId) {
      setProjectId(validProjectId);
      setError(null);
      return;
    }
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    void createAndRedirect();
  }, [validProjectId, createAndRedirect]);

  const refreshArtifacts = useCallback(async (activeProjectId: string) => {
    setError(null);
    try {
      let items = await listArtifacts(activeProjectId);
      if (items.length === 0) {
        await createArtifact(activeProjectId);
        items = await listArtifacts(activeProjectId);
      }
      setArtifacts(items);
      setCurrentArtifactId((prev) =>
        prev && items.some((item) => item.id === prev) ? prev : null
      );
    } catch {
      setError("加载制品失败，请重试。");
    }
  }, [listArtifacts, createArtifact]);

  useEffect(() => {
    if (!projectId) return;
    void refreshArtifacts(projectId);
  }, [projectId, refreshArtifacts]);

  const loadContext = useCallback(async (artifactId: string) => {
    if (!projectId) return;
    setIsLoadingContext(true);
    setContextError(null);
    try {
      const context = await loadArtifactContext(projectId, artifactId);
      setArtifact(context.artifact);
      setSessions(context.sessions);
      setCurrentSessionId(context.currentSessionId);
      setInitialMessages(context.history);
    } catch {
      setContextError("加载制品失败，请重试。");
    } finally {
      setIsLoadingContext(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !currentArtifactId) {
      setArtifact(null);
      setSessions([]);
      setCurrentSessionId(null);
      setInitialMessages([]);
      setContextError(null);
      return;
    }
    void loadContext(currentArtifactId);
  }, [projectId, currentArtifactId, loadContext]);

  const handleSelectArtifact = (artifactItem: Artifact) => {
    setCurrentArtifactId(artifactItem.id);
    setIsSidebarOpen(false);
  };

  const handleCreateArtifact = async () => {
    if (!projectId || isCreatingArtifact) return;
    setIsCreatingArtifact(true);
    setError(null);
    setIsSidebarOpen(false);
    try {
      const created = await createArtifact(projectId);
      const items = await listArtifacts(projectId);
      setArtifacts(items);
      setCurrentArtifactId(created.id);
    } catch {
      setError("新建制品失败，请重试。");
    } finally {
      setIsCreatingArtifact(false);
    }
  };

  const handleDeleteArtifact = async (artifactItem: Artifact) => {
    if (!projectId || isDeletingArtifactId) return;
    const confirmed = window.confirm("确认删除该制品及其历史会话？");
    if (!confirmed) return;
    setIsDeletingArtifactId(artifactItem.id);
    setError(null);
    try {
      await deleteArtifact(projectId, artifactItem.id);
      const items = await listArtifacts(projectId);
      setArtifacts(items);
      if (currentArtifactId === artifactItem.id) {
        setCurrentArtifactId(null);
        setArtifact(null);
        setSessions([]);
        setCurrentSessionId(null);
        setInitialMessages([]);
      }
    } catch {
      setError("删除制品失败，请重试。");
    } finally {
      setIsDeletingArtifactId(null);
    }
  };

  const handleEditArtifact = (artifactItem: Artifact) => {
    if (!projectId) return;
    router.push(`/artifacts/edit/${artifactItem.id}?projectId=${projectId}`);
  };

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!projectId || !currentArtifactId || sessionId === currentSessionId) {
        return;
      }
      setIsLoadingContext(true);
      setContextError(null);
      try {
        const context = await loadArtifactSession(
          projectId,
          currentArtifactId,
          sessionId
        );
        setInitialMessages(context.history);
        setCurrentSessionId(sessionId);
      } catch {
        setContextError("加载会话失败，请重试。");
      } finally {
        setIsLoadingContext(false);
      }
    },
    [projectId, currentArtifactId, currentSessionId]
  );

  const handleCreateSession = useCallback(async () => {
    if (!projectId || !currentArtifactId || isCreatingSession) return;
    setIsCreatingSession(true);
    setContextError(null);
    try {
      const sessionId = await createArtifactSession(projectId, currentArtifactId);
      setCurrentSessionId(sessionId);
      setInitialMessages([]);
      setSessions((prev) => [
        { id: sessionId, created_at: new Date(), last_message: "未开始" },
        ...prev,
      ]);
    } catch {
      setContextError("创建会话失败，请重试。");
    } finally {
      setIsCreatingSession(false);
    }
  }, [projectId, currentArtifactId, isCreatingSession]);

  const handleSessionIdChange = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    setSessions((prev) => {
      if (prev.some((item) => item.id === sessionId)) return prev;
      return [{ id: sessionId, created_at: new Date(), last_message: "未开始" }, ...prev];
    });
  }, []);

  const formatSessionLabel = (value: string | Date) => {
    const dateValue = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(dateValue.getTime())) {
      return "新对话";
    }
    return dateValue.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const currentArtifact = useMemo(
    () => artifacts.find((item) => item.id === currentArtifactId) ?? null,
    [artifacts, currentArtifactId]
  );

  if (!projectId) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <TopNav />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-md border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">
              {isCreatingProject ? "正在创建新项目..." : "准备创建你的新项目。"}
            </p>
            <button
              disabled
              className="mt-6 w-full border border-slate-900 bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
            >
              加载中...
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-50">
      <TopNav />
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-slate-900">制品库</span>
        <div className="w-9" />
      </div>

      <main className="flex flex-1 min-h-0 w-full overflow-hidden">
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/20 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <aside
          className={[
            "fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col border-r border-slate-200 bg-white transition-transform duration-300 ease-in-out lg:static lg:z-0 lg:w-80 lg:translate-x-0",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                  <Layers className="h-5 w-5 text-indigo-600" />
                  <span>制品库</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsSidebarOpen(false)}
                    className="p-1 text-slate-400 hover:bg-slate-100 lg:hidden"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleCreateArtifact}
                    disabled={isCreatingArtifact}
                    className="p-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    title="新建制品"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  placeholder="搜索制品..."
                  className="w-full border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs outline-none focus:border-slate-400"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {artifacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Box className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-xs text-slate-400">暂无制品</p>
                  <button
                    onClick={handleCreateArtifact}
                    className="mt-3 text-xs font-bold text-slate-700 hover:text-slate-900"
                  >
                    立即新建
                  </button>
                </div>
              ) : (
                artifacts.map((item) => {
                  const isActive = item.id === currentArtifactId;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectArtifact(item)}
                      className={[
                        "w-full cursor-pointer px-3 py-3",
                        isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold break-words">
                            {item.title || "未命名制品"}
                          </h4>
                          <p
                            className={[
                              "text-xs mt-1 line-clamp-2 break-words",
                              isActive ? "text-slate-200" : "text-slate-500",
                            ].join(" ")}
                          >
                            {item.problem || "暂无描述"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleEditArtifact(item);
                            }}
                            className={[
                              "p-1",
                              isActive ? "text-slate-200 hover:text-white" : "text-slate-400 hover:text-slate-700",
                            ].join(" ")}
                            title="编辑制品"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteArtifact(item);
                            }}
                            disabled={isDeletingArtifactId === item.id}
                            className={[
                              "p-1",
                              isActive ? "text-slate-200 hover:text-white" : "text-slate-400 hover:text-rose-500",
                            ].join(" ")}
                            title="删除制品"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {!currentArtifact ? (
          <section className="flex flex-1 items-center justify-center border-l border-slate-200 bg-white">
            <div className="text-center text-slate-400">
              <MessageSquare className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm">请选择左侧制品开始对话</p>
              {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
            </div>
          </section>
        ) : (
          <>
            <section className="flex min-h-0 flex-1 flex-col border-l border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">会话窗口</p>
                  <h2 className="text-sm font-bold text-slate-900 truncate">
                    {artifact?.title ?? ""}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {contextError && (
                    <span className="text-xs text-rose-500">{contextError}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => currentArtifactId && loadContext(currentArtifactId)}
                    className="p-2 border border-slate-200 text-slate-500 hover:text-slate-700"
                    title="刷新"
                  >
                    <RotateCw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0">
                {contextError ? (
                  <div className="flex h-full flex-col items-center justify-center text-slate-400">
                    <p className="text-sm">加载失败，请重试。</p>
                    <button
                      type="button"
                      onClick={() => currentArtifactId && loadContext(currentArtifactId)}
                      className="mt-3 border border-slate-900 bg-slate-900 px-4 py-2 text-xs text-white"
                    >
                      重新加载
                    </button>
                  </div>
                ) : isLoadingContext ? (
                  <div className="h-full p-6">
                    <div className="h-4 w-40 bg-slate-100" />
                    <div className="mt-4 space-y-3">
                      <div className="h-10 bg-slate-100" />
                      <div className="h-10 bg-slate-100" />
                      <div className="h-10 bg-slate-100" />
                    </div>
                  </div>
                ) : currentSessionId ? (
                  <ArtifactChat
                    key={`${currentArtifactId}-${currentSessionId}`}
                    projectId={projectId}
                    artifactId={currentArtifactId}
                    sessionId={currentSessionId}
                    initialMessages={initialMessages}
                    variables={artifact?.variables}
                    onSessionIdChange={handleSessionIdChange}
                  />
                ) : null}
              </div>
            </section>

            <aside className="hidden w-72 shrink-0 flex-col border-l border-slate-200 bg-white lg:flex">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <p className="text-xs text-slate-400">会话列表</p>
                  <p className="text-sm font-semibold text-slate-900">{artifact?.title ?? ""}</p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateSession}
                  disabled={isCreatingSession}
                  className="border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  新建对话
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {sessions.length === 0 ? (
                  <p className="text-xs text-slate-400">暂无历史对话。</p>
                ) : (
                  <div className="space-y-1">
                    {sessions.map((session, index) => {
                      const isActive = session.id === currentSessionId;
                      const summary = session.last_message ?? "未开始";
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => handleSelectSession(session.id)}
                          className={[
                            "w-full cursor-pointer px-3 py-3 text-left text-xs",
                            isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between">
                            <span>会话 {sessions.length - index}</span>
                            <span className="text-[10px] text-slate-400">
                              {formatSessionLabel(session.created_at)}
                            </span>
                          </div>
                          <p
                            className={[
                              "mt-2 truncate text-[11px]",
                              isActive ? "text-slate-200" : "text-slate-500",
                            ].join(" ")}
                          >
                            {summary}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          </>
        )}
      </main>
    </div>
  );
}

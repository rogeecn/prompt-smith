"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Menu, Plus, Trash2, History, X } from "lucide-react";
import ChatInterface from "./ChatInterface";
import TopNav from "./TopNav";
import {
  createProject,
  createSession,
  deleteSession,
  loadProjectContext,
  loadSessionContext,
} from "../src/app/actions";
import type { HistoryItem, SessionState } from "../lib/schemas";

const projectIdSchema = z.string().uuid();

type HomeClientProps = {
  initialProjectId?: string | null;
};

export default function HomeClient({ initialProjectId = null }: HomeClientProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<HistoryItem[]>([]);
  const [initialState, setInitialState] = useState<SessionState | null>(null);
  const [sessions, setSessions] = useState<
    { id: string; created_at: string | Date; last_message?: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const hasRequestedRef = useRef(false);

  const validProjectId = projectIdSchema.safeParse(initialProjectId).success
    ? initialProjectId
    : null;

  const createAndRedirect = useCallback(async () => {
    if (isCreating) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const newProjectId = await createProject();
      setProjectId(newProjectId);
      setInitialMessages([]);
      router.replace(`/?projectId=${newProjectId}`);
    } catch {
      setError("创建项目失败，请重试。");
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, router]);

  useEffect(() => {
    if (validProjectId) {
      setProjectId(validProjectId);
      setError(null);
      return;
    }

    if (hasRequestedRef.current) {
      return;
    }

    hasRequestedRef.current = true;
    void createAndRedirect();
  }, [validProjectId, createAndRedirect]);

  const loadContext = useCallback(async (activeProjectId: string) => {
    setIsLoadingContext(true);
    setContextError(null);

    try {
      const context = await loadProjectContext(activeProjectId);
      setInitialMessages(context.history);
      setSessions(context.sessions);
      setCurrentSessionId(context.currentSessionId);
      setInitialState(context.state);
    } catch {
      setContextError("加载项目失败，请重试。");
    } finally {
      setIsLoadingContext(false);
    }
  }, [loadProjectContext]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    void loadContext(projectId);
  }, [projectId, loadContext]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!projectId || sessionId === currentSessionId) {
        setIsSidebarOpen(false);
        return;
      }

      setIsLoadingContext(true);
      setContextError(null);
      setIsSidebarOpen(false);

      try {
        const context = await loadSessionContext(projectId, sessionId);
        setInitialMessages(context.history);
        setInitialState(context.state);
        setCurrentSessionId(sessionId);
      } catch {
        setContextError("加载会话失败，请重试。");
      } finally {
        setIsLoadingContext(false);
      }
    },
    [projectId, currentSessionId, loadSessionContext]
  );

  const handleCreateSession = useCallback(async () => {
    if (!projectId || isCreatingSession) {
      return;
    }

    setIsCreatingSession(true);
    setContextError(null);
    setIsSidebarOpen(false);

    try {
      const sessionId = await createSession(projectId);
      setCurrentSessionId(sessionId);
      setInitialMessages([]);
      setInitialState(null);
      setSessions((prev) => [
        { id: sessionId, created_at: new Date(), last_message: "未开始" },
        ...prev,
      ]);
    } catch {
      setContextError("创建会话失败，请重试。");
    } finally {
      setIsCreatingSession(false);
    }
  }, [projectId, isCreatingSession, createSession]);

  const handleSessionTitleUpdate = useCallback(
    (title: string) => {
      if (!currentSessionId) {
        return;
      }
      setSessions((prev) =>
        prev.map((session) =>
          session.id === currentSessionId
            ? { ...session, last_message: title }
            : session
        )
      );
    },
    [currentSessionId]
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!projectId) {
        return;
      }

      const confirmed =
        typeof window !== "undefined"
          ? window.confirm("确认删除该会话吗？")
          : false;
      if (!confirmed) {
        return;
      }

      setContextError(null);
      setIsLoadingContext(true);

      try {
        await deleteSession(projectId, sessionId);
        await loadContext(projectId);
      } catch {
        setContextError("删除会话失败，请重试。");
      } finally {
        setIsLoadingContext(false);
      }
    },
    [projectId, deleteSession, loadContext]
  );

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

  if (!projectId) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <TopNav />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-md rounded-3xl border border-white bg-white/60 p-8 text-center shadow-xl backdrop-blur-xl">
            <p className="text-sm text-slate-500">
              {isCreating ? "正在创建新项目..." : "准备创建你的新项目。"}
            </p>
            <button
              type="button"
              onClick={createAndRedirect}
              disabled={isCreating}
              className="mt-6 w-full rounded-2xl bg-indigo-600 px-5 py-4 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isCreating ? "正在创建..." : "开始新项目"}
            </button>
            {error ? (
              <p className="mt-3 text-xs text-rose-500">{error}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-50">
      <TopNav />
      
      {/* Mobile Header with Menu Toggle */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-slate-900">当前对话</span>
        <div className="w-9" /> {/* Spacer for centering */}
      </div>

      <main className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Sidebar - Desktop: Static Left, Mobile: Drawer */}
        <>
          {/* Mobile Overlay */}
          {isSidebarOpen && (
            <div 
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
          
          <aside 
            className={`
              fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:z-0 lg:w-80 lg:translate-x-0 lg:shadow-none
              ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
            `}
          >
            <div className="flex h-full flex-col">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
                {/* Sidebar Header */}
                <div className="flex items-center justify-between p-4 lg:p-5">
                  <div className="flex items-center gap-2 text-slate-500">
                    <History className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">历史记录</span>
                  </div>
                  <button 
                    onClick={() => setIsSidebarOpen(false)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 lg:hidden"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* New Chat Button */}
                <div className="px-4 pb-2 lg:px-5">
                  <button
                    onClick={handleCreateSession}
                    disabled={isCreatingSession}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-100 transition hover:bg-indigo-700 disabled:opacity-70"
                  >
                    <Plus className="h-4 w-4" />
                    <span>新对话</span>
                  </button>
                </div>

                {/* Session List */}
                <div className="flex-1 overflow-y-auto px-4 py-2 lg:px-5">
                  {sessions.length === 0 ? (
                    <div className="flex h-32 flex-col items-center justify-center text-center text-xs text-slate-400">
                      <p>暂无历史对话</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sessions.map((session) => {
                        const isActive = session.id === currentSessionId;
                        const summary = session.last_message ?? "未开始";
                        return (
                          <div 
                            key={session.id} 
                            className="group relative flex items-center"
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectSession(session.id)}
                              className={`
                                flex min-w-0 flex-1 flex-col gap-1 rounded-xl px-4 py-3 text-left transition-all
                                ${isActive 
                                  ? "bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200" 
                                  : "bg-transparent text-slate-600 hover:bg-slate-100/80"
                                }
                              `}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-xs font-medium ${isActive ? "text-indigo-700" : "text-slate-900"}`}>
                                  会话 {formatSessionLabel(session.created_at)}
                                </span>
                              </div>
                              <p className={`truncate text-xs ${isActive ? "text-indigo-600/80" : "text-slate-500"}`}>
                                {summary}
                              </p>
                            </button>
                            
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteSession(session.id);
                              }}
                              className={`
                                absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 opacity-0 transition hover:bg-rose-50 hover:text-rose-600
                                ${isActive ? "opacity-100" : "group-hover:opacity-100"}
                              `}
                              aria-label="删除会话"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </>

        {/* Main Chat Area - Island Style */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-full flex-col overflow-hidden bg-white">
            {contextError ? (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="mb-4 rounded-full bg-rose-50 p-4">
                  <X className="h-8 w-8 text-rose-500" />
                </div>
                <p className="text-sm text-slate-600">{contextError}</p>
                <button
                  type="button"
                  onClick={() => loadContext(projectId)}
                  className="mt-6 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700"
                >
                  重新加载
                </button>
              </div>
            ) : isLoadingContext ? (
              <div className="flex h-full flex-col p-6">
                <div className="mb-8 h-8 w-48 animate-pulse rounded-lg bg-slate-100" />
                <div className="space-y-6">
                  <div className="h-24 w-full animate-pulse rounded-2xl bg-slate-50" />
                  <div className="h-32 w-full animate-pulse rounded-2xl bg-slate-50" />
                  <div className="h-24 w-full animate-pulse rounded-2xl bg-slate-50" />
                </div>
              </div>
            ) : currentSessionId ? (
              <ChatInterface
                key={`${projectId}-${currentSessionId}`}
                projectId={projectId}
                sessionId={currentSessionId}
                initialMessages={initialMessages}
                initialState={initialState ?? undefined}
                onSessionTitleUpdate={handleSessionTitleUpdate}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="mb-6 rounded-3xl bg-indigo-50 p-6">
                  <History className="h-10 w-10 text-indigo-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">开始新的创作</h3>
                <p className="mt-2 max-w-xs text-sm text-slate-500">
                  选择左侧历史会话，或创建一个新对话开始 Prompt 设计。
                </p>
                <button
                  onClick={handleCreateSession}
                  disabled={isCreatingSession}
                  className="mt-8 flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 hover:-translate-y-0.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>创建新对话</span>
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

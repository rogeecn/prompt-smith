"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import ChatInterface from "../../components/ChatInterface";
import TopNav from "../../components/TopNav";
import {
  createProject,
  createSession,
  deleteSession,
  loadProjectContext,
  loadSessionContext,
} from "./actions";
import type { HistoryItem, SessionState } from "../../lib/schemas";

const projectIdSchema = z.string().uuid();

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const hasRequestedRef = useRef(false);

  const rawProjectId = searchParams.get("projectId");
  const validProjectId = projectIdSchema.safeParse(rawProjectId).success
    ? rawProjectId
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
        return;
      }

      setIsLoadingContext(true);
      setContextError(null);

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
      <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_45%,#e2e8f0_100%)]">
        <TopNav />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-md rounded-3xl border border-slate-200/70 bg-white/90 p-6 text-center shadow-[0_20px_50px_-35px_rgba(15,23,42,0.5)]">
            <p className="text-sm text-slate-500">
              {isCreating ? "正在创建新项目..." : "准备创建你的新项目。"}
            </p>
            <button
              type="button"
              onClick={createAndRedirect}
              disabled={isCreating}
              className="mt-5 w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
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
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_45%,#e2e8f0_100%)]">
      <TopNav />
      <main className="flex flex-1 min-h-0 w-full flex-col gap-6 overflow-hidden px-4 py-4 box-border">
        <div className="grid h-full min-h-0 flex-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="flex min-h-0 flex-1 flex-col">
            {contextError ? (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-6 text-center">
                <p className="text-sm text-slate-500">{contextError}</p>
                <button
                  type="button"
                  onClick={() => loadContext(projectId)}
                  className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  重新加载
                </button>
              </div>
            ) : isLoadingContext ? (
              <div className="h-full rounded-2xl border border-slate-200 bg-white/70 p-5">
                <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
                <div className="mt-5 space-y-3">
                  <div className="h-12 animate-pulse rounded-xl bg-slate-200/80" />
                  <div className="h-12 animate-pulse rounded-xl bg-slate-200/80" />
                  <div className="h-12 animate-pulse rounded-xl bg-slate-200/80" />
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
            ) : null}
          </section>
          <aside className="flex min-h-0 flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.32em] text-slate-400">
                历史记录
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  选择会话查看历史内容
                </p>
                <button
                  type="button"
                  onClick={handleCreateSession}
                  disabled={isCreatingSession}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  开始新对话
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white/70">
              <div className="max-h-full overflow-y-auto p-3">
                {sessions.length === 0 ? (
                  <p className="text-xs text-slate-400">暂无历史对话。</p>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((session, index) => {
                      const isActive = session.id === currentSessionId;
                      const summary = session.last_message ?? "未开始";
                      return (
                        <div key={session.id} className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectSession(session.id)}
                            className={[
                              "flex-1 cursor-pointer rounded-xl border px-3 py-3 text-left text-sm transition",
                              isActive
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-slate-100",
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between">
                              <span>会话 {sessions.length - index}</span>
                              <span className="text-xs text-slate-400">
                                {formatSessionLabel(session.created_at)}
                              </span>
                            </div>
                            <p
                              className={[
                                "mt-2 truncate text-xs",
                                isActive ? "text-slate-200" : "text-slate-500",
                              ].join(" ")}
                            >
                              {summary}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteSession(session.id);
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] text-slate-500 transition hover:bg-slate-100"
                            aria-label={`删除会话 ${sessions.length - index}`}
                          >
                            删除
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

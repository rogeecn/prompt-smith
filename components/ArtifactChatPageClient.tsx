"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Check, Pencil, Trash2, X } from "lucide-react";
import ArtifactChat from "./ArtifactChat";
import TopNav from "./TopNav";
import {
  createArtifactSession,
  deleteArtifactSession,
  loadArtifactContext,
  loadArtifactSession,
  updateArtifact,
  updateArtifactSessionTitle,
} from "../lib/local-store";
import type { Artifact, HistoryItem } from "../lib/schemas";

const projectIdSchema = z.string().uuid();

type ArtifactChatPageClientProps = {
  artifactId: string;
  initialProjectId?: string | null;
};

export default function ArtifactChatPageClient({
  artifactId,
  initialProjectId = null,
}: ArtifactChatPageClientProps) {
  const router = useRouter();
  const validProjectId = projectIdSchema.safeParse(initialProjectId).success
    ? initialProjectId
    : null;

  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [sessions, setSessions] = useState<
    { id: string; title?: string | null; created_at: string | Date; last_message?: string }[]
  >([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<HistoryItem[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const [sessionDeleteTarget, setSessionDeleteTarget] = useState<{
    id: string;
    title?: string | null;
  } | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  const loadContext = useCallback(async () => {
    if (!validProjectId || !artifactId) {
      return;
    }

    setIsLoadingContext(true);
    setContextError(null);

    try {
      const context = await loadArtifactContext(validProjectId, artifactId);
      setArtifact(context.artifact);
      setSessions(context.sessions);
      setCurrentSessionId(context.currentSessionId);
      setInitialMessages(context.history);
      setTitleDraft(context.artifact.title ?? "");
    } catch {
      setContextError("加载制品失败，请重试。");
    } finally {
      setIsLoadingContext(false);
    }
  }, [validProjectId, artifactId]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    setTitleDraft(artifact?.title ?? "");
    setIsEditingTitle(false);
    setTitleError(null);
  }, [artifact?.title]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!validProjectId || !artifactId || sessionId === currentSessionId) {
        return;
      }

      setIsLoadingContext(true);
      setContextError(null);

      try {
        const context = await loadArtifactSession(
          validProjectId,
          artifactId,
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
    [validProjectId, artifactId, currentSessionId]
  );

  const handleCreateSession = useCallback(async () => {
    if (!validProjectId || !artifactId || isCreatingSession) {
      return;
    }

    setIsCreatingSession(true);
    setContextError(null);

    try {
      const sessionId = await createArtifactSession(validProjectId, artifactId);
      setCurrentSessionId(sessionId);
      setInitialMessages([]);
      setSessions((prev) => [
        { id: sessionId, title: null, created_at: new Date(), last_message: "未开始" },
        ...prev,
      ]);
    } catch {
      setContextError("创建会话失败，请重试。");
    } finally {
      setIsCreatingSession(false);
    }
  }, [validProjectId, artifactId, isCreatingSession]);

  const handleEditSessionTitle = (sessionId: string, title?: string | null) => {
    setEditingSessionId(sessionId);
    setSessionTitleDraft(title ?? "");
  };

  const commitSessionTitle = async (sessionId: string) => {
    if (!validProjectId || !artifactId) return;
    const trimmed = sessionTitleDraft.trim();
    if (!trimmed) {
      setEditingSessionId(null);
      setSessionTitleDraft("");
      return;
    }
    try {
      await updateArtifactSessionTitle(validProjectId, artifactId, sessionId, trimmed);
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
    if (!validProjectId || !artifactId || !sessionDeleteTarget) return;
    setDeletingSessionId(sessionDeleteTarget.id);
    try {
      await deleteArtifactSession(validProjectId, artifactId, sessionDeleteTarget.id);
      setSessions((prev) => prev.filter((item) => item.id !== sessionDeleteTarget.id));
      if (currentSessionId === sessionDeleteTarget.id) {
        const nextSession = sessions.find((item) => item.id !== sessionDeleteTarget.id);
        if (nextSession) {
          setCurrentSessionId(nextSession.id);
          const context = await loadArtifactSession(
            validProjectId,
            artifactId,
            nextSession.id
          );
          setInitialMessages(context.history);
        } else {
          const newSessionId = await createArtifactSession(validProjectId, artifactId);
          setCurrentSessionId(newSessionId);
          setInitialMessages([]);
          setSessions((prev) => [
            { id: newSessionId, title: null, created_at: new Date(), last_message: "未开始" },
            ...prev,
          ]);
        }
      }
    } finally {
      setDeletingSessionId(null);
      setSessionDeleteTarget(null);
    }
  };

  const handleSaveTitle = useCallback(async () => {
    if (!validProjectId || !artifact || isSavingTitle) {
      return;
    }
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleError("标题不能为空。");
      return;
    }
    setIsSavingTitle(true);
    setTitleError(null);
    try {
      const updated = await updateArtifact(validProjectId, artifactId, {
        title: trimmed,
        problem: artifact.problem ?? "",
        prompt_content: artifact.prompt_content ?? "",
        variables: artifact.variables ?? [],
      });
      setArtifact(updated);
      setIsEditingTitle(false);
    } catch {
      setTitleError("保存失败，请重试。");
    } finally {
      setIsSavingTitle(false);
    }
  }, [validProjectId, artifactId, artifact, titleDraft, isSavingTitle]);

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

  if (!validProjectId || !artifactId) {
    return (
      <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_45%,#e2e8f0_100%)]">
        <TopNav />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-md rounded-3xl border border-slate-200/70 bg-white/90 p-6 text-center shadow-[0_20px_50px_-35px_rgba(15,23,42,0.5)]">
            <p className="text-sm text-slate-500">
              缺少必要参数，请从制品库进入。
            </p>
            <button
              type="button"
              onClick={() =>
                router.push(
                  validProjectId ? `/projects/${validProjectId}/artifacts` : "/"
                )
              }
              className="mt-5 w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              返回制品库
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_45%,#e2e8f0_100%)]">
      <TopNav />
      <main className="flex flex-1 min-h-0 w-full flex-col gap-6 overflow-y-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-slate-400">
              制品对话
            </p>
            {isEditingTitle ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSaveTitle();
                  }
                }}
                className="mt-2 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500"
                placeholder="输入制品标题"
              />
            ) : (
              <h1 className="text-lg font-semibold text-slate-900">
                {artifact?.title ?? "加载中"}
              </h1>
            )}
            {titleError && (
              <p className="mt-1 text-xs text-rose-500">{titleError}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditingTitle ? (
              <>
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  disabled={isSavingTitle}
                  className="flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Check className="h-4 w-4" />
                  {isSavingTitle ? "保存中..." : "保存"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTitleDraft(artifact?.title ?? "");
                    setTitleError(null);
                    setIsEditingTitle(false);
                  }}
                  className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                  取消
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                <Pencil className="h-4 w-4" />
                编辑标题
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (validProjectId) {
                  router.push(`/projects/${validProjectId}/artifacts`);
                }
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              返回制品库
            </button>
            <button
              type="button"
              onClick={handleCreateSession}
              disabled={isCreatingSession}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              开始新对话
            </button>
          </div>
        </div>

        <div className="grid h-full min-h-0 flex-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="flex min-h-0 flex-1 flex-col gap-4">
            {contextError ? (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-6 text-center">
                <p className="text-sm text-slate-500">{contextError}</p>
                <button
                  type="button"
                  onClick={() => void loadContext()}
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
              <ArtifactChat
                key={`${artifactId}-${currentSessionId}`}
                projectId={validProjectId}
                artifactId={artifactId}
                sessionId={currentSessionId}
                promptContent={artifact?.prompt_content ?? ""}
                initialMessages={initialMessages}
                variables={artifact?.variables ?? []}
              />
            ) : null}
          </section>

          <aside className="flex min-h-0 flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                制品信息
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {artifact?.title ?? ""}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {artifact?.problem ?? ""}
              </p>
              <details className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                  查看制品 Prompt
                </summary>
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs text-slate-600">
                  {artifact?.prompt_content ?? ""}
                </pre>
              </details>
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
                      const title = session.title?.trim() || `会话 ${sessions.length - index}`;
                      return (
                        <div key={session.id} className="group relative">
                          {editingSessionId === session.id ? (
                            <div
                              className={[
                                "w-full rounded-xl border px-3 py-3 pr-10 text-left text-sm transition",
                                isActive
                                  ? "border-slate-900 bg-slate-900 text-white"
                                  : "border-transparent bg-slate-50 text-slate-700",
                              ].join(" ")}
                            >
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
                                  className="w-full min-w-0 flex-1 border-b border-slate-200 bg-transparent text-xs font-semibold text-slate-900 outline-none focus:border-slate-900"
                                  placeholder="输入会话标题"
                                />
                                <span className="shrink-0 text-xs text-slate-400">
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
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSelectSession(session.id)}
                              className={[
                                "w-full cursor-pointer rounded-xl border px-3 py-3 pr-10 text-left text-sm transition",
                                isActive
                                  ? "border-slate-900 bg-slate-900 text-white"
                                  : "border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-slate-100",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 flex-1 truncate font-semibold">
                                  {title}
                                </span>
                                <span className="shrink-0 text-xs text-slate-400">
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
                          )}
                          <div className="absolute right-2 top-2 flex flex-col gap-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible">
                            <button
                              type="button"
                              aria-label="编辑会话"
                              onClick={() => handleEditSessionTitle(session.id, session.title)}
                              className="text-slate-400 hover:text-slate-900 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="删除会话"
                              onClick={() => handleDeleteSession(session.id, session.title)}
                              disabled={deletingSessionId === session.id}
                              className="text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
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
            className="w-full max-w-md border border-slate-200 bg-white p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">删除会话</h3>
            <p className="mt-2 text-sm text-slate-600">
              确定要删除“{sessionDeleteTarget.title || "未命名会话"}”吗？此操作无法撤销。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
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

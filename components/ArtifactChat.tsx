"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArtifactChatRequestSchema,
  ArtifactChatResponseSchema,
  type HistoryItem,
} from "../lib/schemas";

const isDebug = process.env.NODE_ENV !== "production";

const logDebug = (label: string, payload?: unknown) => {
  if (!isDebug) {
    return;
  }
  if (payload === undefined) {
    console.log(`[ArtifactChat] ${label}`);
    return;
  }
  console.log(`[ArtifactChat] ${label}`, payload);
};

type ArtifactChatProps = {
  projectId: string;
  artifactId: string;
  sessionId: string;
  initialMessages?: HistoryItem[];
  isDisabled?: boolean;
  onSessionIdChange?: (sessionId: string) => void;
};

export default function ArtifactChat({
  projectId,
  artifactId,
  sessionId,
  initialMessages = [],
  isDisabled = false,
  onSessionIdChange,
}: ArtifactChatProps) {
  const [messages, setMessages] = useState<HistoryItem[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
    setInput("");
    setIsLoading(false);
    setFormError(null);
    setRetryMessage(null);
  }, [projectId, artifactId, sessionId, initialMessages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 160);
    textarea.style.height = `${Math.max(nextHeight, 44)}px`;
  }, [input]);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }

    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isLoading]);

  const sendMessage = async (
    message: string,
    options?: { appendUser?: boolean }
  ) => {
    if (isLoading || isDisabled || !sessionId) {
      return;
    }

    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    const appendUser = options?.appendUser ?? true;
    const optimisticUserMessage: HistoryItem = {
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    if (appendUser) {
      setMessages((prev) => [...prev, optimisticUserMessage]);
    }

    setIsLoading(true);
    setFormError(null);
    setRetryMessage(null);

    const traceId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const requestBody = ArtifactChatRequestSchema.parse({
        projectId,
        artifactId,
        sessionId,
        message: trimmed,
        traceId,
      });

      const response = await fetch("/api/artifacts/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorDetail = "";
        try {
          const errorPayload = (await response.json()) as { error?: string };
          errorDetail = errorPayload?.error ?? "";
        } catch {
          errorDetail = "";
        }
        logDebug("请求失败", { status: response.status, errorDetail });
        const errorMessage =
          response.status === 504
            ? "请求超时，请重试。"
            : errorDetail || "请求失败，请稍后重试。";
        throw new Error(errorMessage);
      }

      const payload = ArtifactChatResponseSchema.parse(await response.json());
      if (payload.sessionId && payload.sessionId !== sessionId) {
        onSessionIdChange?.(payload.sessionId);
      }

      const assistantMessage: HistoryItem = {
        role: "assistant",
        content: payload.reply,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setInput("");
      setRetryMessage(null);
    } catch (error) {
      logDebug("请求异常", error);
      const errorMessage =
        error instanceof Error ? error.message : "请求失败，请稍后再试。";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: errorMessage, timestamp: Date.now() },
      ]);
      setFormError(errorMessage);
      setRetryMessage(trimmed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage(input);
  };

  const handleRetry = async () => {
    if (!retryMessage) {
      return;
    }
    await sendMessage(retryMessage, { appendUser: false });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div
        ref={listRef}
        className="flex-1 min-h-0 space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white/70 p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            请输入你的需求，让制品开始工作。
          </div>
        ) : (
          messages.map((item, index) => {
            const isUser = item.role === "user";
            return (
              <div
                key={`${item.timestamp}-${index}`}
                className={isUser ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={[
                    "max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                    isUser
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-900",
                  ].join(" ")}
                >
                  <div className="whitespace-pre-wrap break-words leading-relaxed [&_code]:rounded [&_code]:bg-slate-200/80 [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {item.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {isLoading ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-xs text-slate-500">
              AI 正在思考
              <span className="typing-dot" />
              <span className="typing-dot typing-dot-delay-1" />
              <span className="typing-dot typing-dot-delay-2" />
            </div>
          </div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
          <label className="text-xs uppercase tracking-[0.32em] text-slate-400">
            继续对话
          </label>
          <textarea
            ref={textareaRef}
            name="artifact-message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage(input);
              }
            }}
            placeholder="输入你的需求或补充信息..."
            maxLength={1000}
            rows={1}
            className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            disabled={isLoading || isDisabled}
          />
          <p className="mt-2 text-[11px] text-slate-400">
            回车发送，Shift+Enter 换行
          </p>
        </div>
        <div className="flex items-center justify-between">
          {formError ? (
            <div className="flex items-center gap-2 text-xs text-rose-500">
              <span>{formError}</span>
              {retryMessage ? (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-600 transition hover:bg-rose-100"
                  disabled={isLoading || isDisabled}
                >
                  重试
                </button>
              ) : null}
            </div>
          ) : (
            <span className="text-xs text-slate-400">
              {isLoading ? "正在调用制品..." : ""}
            </span>
          )}
          <button
            type="submit"
            disabled={isLoading || isDisabled}
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            发送
          </button>
        </div>
      </form>
    </div>
  );
}

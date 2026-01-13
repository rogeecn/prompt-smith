"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArtifactChatRequestSchema,
  ArtifactChatResponseSchema,
  type ArtifactVariable,
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

const parseListInput = (value: string) =>
  value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatDefaultValue = (variable: ArtifactVariable) => {
  const fallback = variable.default;
  if (fallback === undefined || fallback === null) {
    return "";
  }
  if (variable.type === "boolean") {
    return fallback === true ? "true" : fallback === false ? "false" : "";
  }
  if (variable.type === "list") {
    if (Array.isArray(fallback)) {
      return fallback.join(", ");
    }
    return typeof fallback === "string" ? fallback : "";
  }
  return String(fallback);
};

const buildInitialInputs = (variables: ArtifactVariable[]) =>
  variables.reduce<Record<string, string>>((acc, variable) => {
    acc[variable.key] = formatDefaultValue(variable);
    return acc;
  }, {});

type ArtifactChatProps = {
  projectId: string;
  artifactId: string;
  sessionId: string;
  initialMessages?: HistoryItem[];
  variables?: ArtifactVariable[];
  isDisabled?: boolean;
  onSessionIdChange?: (sessionId: string) => void;
};

export default function ArtifactChat({
  projectId,
  artifactId,
  sessionId,
  initialMessages = [],
  variables = [],
  isDisabled = false,
  onSessionIdChange,
}: ArtifactChatProps) {
  const [messages, setMessages] = useState<HistoryItem[]>(initialMessages);
  const [variableInputs, setVariableInputs] = useState<Record<string, string>>({});
  const [variableErrors, setVariableErrors] = useState<Record<string, string>>({});
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
    setVariableInputs(buildInitialInputs(variables));
    setVariableErrors({});
  }, [variables, projectId, artifactId, sessionId]);

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

  const updateVariableInput = (key: string, value: string) => {
    setVariableInputs((prev) => ({ ...prev, [key]: value }));
    if (formError) {
      setFormError(null);
    }
    setVariableErrors((prev) => {
      if (!prev[key]) {
        return prev;
      }
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  };

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

    const inputErrors: Record<string, string> = {};
    const inputPayload: Record<string, string | number | boolean | string[]> = {};

    variables.forEach((variable) => {
      const raw = variableInputs[variable.key] ?? "";
      const fallback = raw || formatDefaultValue(variable);
      const hasValue = typeof fallback === "string" ? fallback.trim() !== "" : true;

      if (!hasValue) {
        if (variable.required ?? true) {
          inputErrors[variable.key] = "请填写该变量";
        }
        return;
      }

      if (variable.type === "number") {
        const numberValue = Number(fallback);
        if (Number.isNaN(numberValue)) {
          inputErrors[variable.key] = "请输入数字";
        } else {
          inputPayload[variable.key] = numberValue;
        }
        return;
      }

      if (variable.type === "boolean") {
        if (fallback === "true") {
          inputPayload[variable.key] = true;
        } else if (fallback === "false") {
          inputPayload[variable.key] = false;
        } else {
          inputErrors[variable.key] = "请选择是或否";
        }
        return;
      }

      if (variable.type === "list") {
        const listValue = parseListInput(fallback);
        if ((variable.required ?? true) && listValue.length === 0) {
          inputErrors[variable.key] = "请填写至少一项";
        } else {
          inputPayload[variable.key] = listValue;
        }
        return;
      }

      if (variable.type === "enum") {
        if (variable.options && !variable.options.includes(fallback)) {
          inputErrors[variable.key] = "请选择可用选项";
        } else {
          inputPayload[variable.key] = fallback;
        }
        return;
      }

      inputPayload[variable.key] = fallback;
    });

    setVariableErrors(inputErrors);
    if (Object.keys(inputErrors).length > 0) {
      setFormError("请先完善变量配置。");
      return;
    }

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
        inputs: inputPayload,
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
      {variables.length > 0 ? (
        <section className="mb-4 rounded-2xl bg-white/70 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.32em] text-slate-400">
              变量配置
            </p>
            <span className="text-xs text-slate-400">
              用于替换制品模板中的占位符
            </span>
          </div>
          <div className="mt-3 max-h-48 space-y-3 overflow-y-auto">
            {variables.map((variable) => {
              const label = variable.label || variable.key;
              const value = variableInputs[variable.key] ?? "";
              const error = variableErrors[variable.key];
              const isRequired = variable.required ?? true;
              return (
                <div
                  key={variable.key}
                  className="rounded-xl bg-white/80 p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{label}</span>
                    <span>{isRequired ? "必填" : "可选"}</span>
                  </div>
                  {variable.type === "text" ? (
                    <textarea
                      value={value}
                      onChange={(event) =>
                        updateVariableInput(variable.key, event.target.value)
                      }
                      placeholder={variable.placeholder ?? "请输入内容"}
                      rows={3}
                      className="mt-2 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                      disabled={isLoading || isDisabled}
                    />
                  ) : variable.type === "enum" && variable.options ? (
                    <select
                      value={value}
                      onChange={(event) =>
                        updateVariableInput(variable.key, event.target.value)
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                      disabled={isLoading || isDisabled}
                    >
                      <option value="">请选择</option>
                      {variable.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : variable.type === "boolean" ? (
                    <select
                      value={value}
                      onChange={(event) =>
                        updateVariableInput(variable.key, event.target.value)
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                      disabled={isLoading || isDisabled}
                    >
                      <option value="">请选择</option>
                      <option value="true">
                        {variable.true_label ?? "是"}
                      </option>
                      <option value="false">
                        {variable.false_label ?? "否"}
                      </option>
                    </select>
                  ) : variable.type === "number" ? (
                    <input
                      type="number"
                      value={value}
                      onChange={(event) =>
                        updateVariableInput(variable.key, event.target.value)
                      }
                      placeholder={variable.placeholder ?? "请输入数字"}
                      className="mt-2 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                      disabled={isLoading || isDisabled}
                    />
                  ) : variable.type === "list" ? (
                    <input
                      value={value}
                      onChange={(event) =>
                        updateVariableInput(variable.key, event.target.value)
                      }
                      placeholder={variable.placeholder ?? "用逗号分隔多个值"}
                      className="mt-2 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                      disabled={isLoading || isDisabled}
                    />
                  ) : (
                    <input
                      value={value}
                      onChange={(event) =>
                        updateVariableInput(variable.key, event.target.value)
                      }
                      placeholder={variable.placeholder ?? "请输入内容"}
                      className="mt-2 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                      disabled={isLoading || isDisabled}
                    />
                  )}
                  {error ? (
                    <p className="mt-2 text-xs text-rose-500">{error}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      <div
        ref={listRef}
        className="flex-1 min-h-0 space-y-4 overflow-y-auto rounded-2xl border border-slate-200/60 bg-white/70 p-4"
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
        <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-4">
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
            className="mt-2 w-full resize-none rounded-xl border border-slate-200/60 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
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

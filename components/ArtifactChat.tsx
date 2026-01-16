"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, AlertCircle, Bot, User } from "lucide-react";
import QuestionForm from "./chat/QuestionForm";
import type {
  ArtifactChatRequest,
  ArtifactChatResponse,
  ArtifactVariable,
  DraftAnswer,
  HistoryItem,
  Question,
} from "../lib/schemas";

const isDebug = process.env.NODE_ENV !== "production";

const logDebug = (label: string, payload?: unknown) => {
  if (!isDebug) return;
  console.log(`[ArtifactChat] ${label}`, payload || "");
};

const parseListInput = (value: string) =>
  value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);

const formatDefaultValue = (variable: ArtifactVariable) => {
  const fallback = variable.default;
  if (fallback === undefined || fallback === null) return "";
  if (variable.type === "boolean") return fallback === true ? "true" : fallback === false ? "false" : "";
  if (variable.type === "enum") {
    if (typeof fallback === "string") {
      const candidate = fallback.split(/[,，]/)[0]?.trim();
      return (candidate && variable.options?.includes(candidate)) ? candidate : (variable.options?.[0] ?? candidate ?? "");
    }
    return "";
  }
  if (variable.type === "list") return Array.isArray(fallback) ? fallback.join(", ") : typeof fallback === "string" ? fallback : "";
  return String(fallback);
};

const buildInitialDraftAnswers = (variables: ArtifactVariable[]) =>
  variables.reduce<Record<string, DraftAnswer>>((acc, variable) => {
    const value = formatDefaultValue(variable);
    if (variable.type === "enum" || variable.type === "boolean") {
      acc[variable.key] = { type: "single", value };
      return acc;
    }
    acc[variable.key] = { type: "text", value };
    return acc;
  }, {});

const buildVariableQuestions = (variables: ArtifactVariable[]): Question[] =>
  variables.map((variable) => {
    const label = variable.label || variable.key;
    if (variable.type === "enum") {
      const options = (variable.options ?? []).map((option) => ({
        id: option,
        label: option,
      }));
      return {
        id: variable.key,
        text: label,
        type: "single",
        options,
        allow_other: false,
        allow_none: !(variable.required ?? true),
        placeholder: variable.placeholder,
      };
    }
    if (variable.type === "boolean") {
      return {
        id: variable.key,
        text: label,
        type: "single",
        options: [
          { id: "true", label: variable.true_label ?? "是" },
          { id: "false", label: variable.false_label ?? "否" },
        ],
        allow_other: false,
        allow_none: !(variable.required ?? true),
        placeholder: variable.placeholder,
      };
    }
    const useTextarea = variable.type === "text" || variable.type === "list";
    return {
      id: variable.key,
      text: label,
      type: "text",
      placeholder: variable.placeholder,
      input_mode: useTextarea ? "textarea" : "input",
    };
  });

const INITIAL_DRAFT_MESSAGE = "请根据当前变量生成初稿。";

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
  const [draftAnswers, setDraftAnswers] = useState<Record<string, DraftAnswer>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [isConfigHidden, setIsConfigHidden] = useState(false);
  const variableQuestions = useMemo(() => buildVariableQuestions(variables), [variables]);
  
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
    setInput("");
    setIsLoading(false);
    setFormError(null);
    setRetryMessage(null);
    setIsConfigHidden(false);
    setFieldErrors({});
  }, [projectId, artifactId, sessionId, initialMessages]);

  useEffect(() => {
    setDraftAnswers(buildInitialDraftAnswers(variables));
    setFieldErrors({});
  }, [variables, projectId, artifactId, sessionId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const updateVariableInput = (key: string, value: string) => {
    setDraftAnswers((prev) => ({ ...prev, [key]: { type: "text", value } }));
    setFormError(null);
    setFieldErrors((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  };

  const updateVariableSelect = (key: string, value: string) => {
    setDraftAnswers((prev) => ({ ...prev, [key]: { type: "single", value } }));
    setFormError(null);
    setFieldErrors((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  };

  const sendMessage = async (message: string, options?: { appendUser?: boolean }): Promise<boolean> => {
    if (isLoading || isDisabled || !sessionId) return false;
    const trimmed = message.trim();
    if (!trimmed) return false;

    const inputErrors: Record<string, string> = {};
    const inputPayload: Record<string, string | number | boolean | string[]> = {};

    variables.forEach((variable) => {
      const draft = draftAnswers[variable.key];
      const raw = typeof draft?.value === "string" ? draft.value.trim() : "";
      const fallback = raw || formatDefaultValue(variable);
      const hasValue = typeof fallback === "string" ? fallback.trim() !== "" : true;

      if (!hasValue) {
        if (variable.required ?? true) inputErrors[variable.key] = "请填写该变量";
        return;
      }

      if (variable.type === "number") {
        const num = Number(fallback);
        if (Number.isNaN(num)) inputErrors[variable.key] = "请输入数字";
        else inputPayload[variable.key] = num;
      } else if (variable.type === "boolean") {
        if (fallback === "true") inputPayload[variable.key] = true;
        else if (fallback === "false") inputPayload[variable.key] = false;
        else inputErrors[variable.key] = "请选择是或否";
      } else if (variable.type === "list") {
        const list = parseListInput(fallback);
        if ((variable.required ?? true) && list.length === 0) inputErrors[variable.key] = "请填写至少一项";
        else inputPayload[variable.key] = list;
      } else if (variable.type === "enum") {
        if (variable.options && !variable.options.includes(fallback)) inputErrors[variable.key] = "请选择可用选项";
        else inputPayload[variable.key] = fallback;
      } else {
        inputPayload[variable.key] = fallback;
      }
    });

    setFieldErrors(inputErrors);
    if (Object.keys(inputErrors).length > 0) {
      setFormError("请先完善变量配置。");
      return false;
    }

    if (options?.appendUser ?? true) {
      setMessages((prev) => [...prev, { role: "user", content: trimmed, timestamp: Date.now() }]);
    }

    setIsLoading(true);
    setFormError(null);
    setRetryMessage(null);

    try {
      const traceId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
      const response = await fetch("/api/artifacts/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId, artifactId, sessionId, message: trimmed, traceId, inputs: inputPayload,
        } as ArtifactChatRequest),
      });

      if (!response.ok) throw new Error("Request failed");
      const payload = (await response.json()) as ArtifactChatResponse;
      
      if (payload.sessionId && payload.sessionId !== sessionId) {
        onSessionIdChange?.(payload.sessionId);
      }

      setMessages((prev) => [...prev, { role: "assistant", content: payload.reply, timestamp: Date.now() }]);
      setInput("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "请求失败";
      setMessages((prev) => [...prev, { role: "assistant", content: msg, timestamp: Date.now() }]);
      setFormError(msg);
      setRetryMessage(trimmed);
    } finally {
      setIsLoading(false);
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const handleInitialGenerate = async () => {
    const success = await sendMessage(INITIAL_DRAFT_MESSAGE, { appendUser: false });
    if (success) setIsConfigHidden(true);
  };

  const handleInitialGenerateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleInitialGenerate();
  };

  const hasConversation = messages.length > 0;
  
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* Configuration Panel - Reuse Question Form */}
      {variables.length > 0 && !isConfigHidden && !hasConversation && (
        <QuestionForm
          questions={variableQuestions}
          draftAnswers={draftAnswers}
          fieldErrors={fieldErrors}
          isLoading={isLoading}
          isDisabled={isDisabled}
          saveStatusLabel=""
          formError={formError}
          onTextChange={updateVariableInput}
          onSingleSelect={updateVariableSelect}
          onMultiToggle={() => null}
          onOtherChange={(key, value) =>
            setDraftAnswers((prev) => ({
              ...prev,
              [key]: { ...(prev[key] ?? { type: "text", value: "" }), other: value },
            }))
          }
          onSelectAll={() => null}
          onSubmit={handleInitialGenerateSubmit}
          onRetry={
            retryMessage
              ? () => {
                  void sendMessage(retryMessage, { appendUser: false });
                }
              : undefined
          }
        />
      )}

      {/* Message Stream - Forum Style */}
      {(hasConversation || isConfigHidden) && (
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {messages.map((item, index) => {
            const isUser = item.role === "user";
            return (
              <div 
                key={`${item.timestamp}-${index}`}
                className={`w-full ${isUser ? "bg-block-user" : "bg-block-ai"}`}
              >
                <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 flex gap-6">
                  <div className="flex flex-col items-center pt-1">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-sm ${isUser ? "bg-white text-slate-600" : "bg-indigo-600 text-white"}`}>
                      {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {isUser ? "用户指令" : "AI 生成结果"}
                      </span>
                    </div>
                    <div className={`prose prose-sm max-w-none leading-relaxed break-words ${isUser ? "text-slate-700" : "text-slate-800"}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          
          {isLoading && (
            <div className="w-full bg-block-ai">
              <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 flex gap-6 animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-slate-200" />
                <div className="flex-1 space-y-3 pt-1">
                  <div className="h-4 w-1/3 rounded bg-slate-200" />
                  <div className="h-4 w-2/3 rounded bg-slate-100" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Input Area */}
      {hasConversation && (
        <div className="border-t border-slate-100 bg-white/80 pb-8 pt-4 backdrop-blur-xl">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <form onSubmit={handleSubmit} className="relative">
              <div className="relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/50 transition-all focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10">
                <div className="px-5 pt-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">继续对话</span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
                  placeholder="输入你的反馈或补充指令..."
                  className="w-full resize-none bg-transparent px-5 py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 min-h-[56px]"
                  rows={1}
                />
                <div className="flex items-center justify-between border-t border-slate-50 bg-slate-50/50 px-5 py-3">
                  <div className="flex items-center gap-4 text-[10px] font-medium text-slate-400">
                    <span className="flex items-center gap-1.5"><kbd className="rounded border bg-white px-1.5 py-0.5 font-sans">Enter</kbd> 发送</span>
                    <span className="flex items-center gap-1.5"><kbd className="rounded border bg-white px-1.5 py-0.5 font-sans">Shift + Enter</kbd> 换行</span>
                  </div>
                  <button 
                    type="submit" 
                    disabled={isLoading || isDisabled || !input.trim()}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700 hover:scale-105 active:scale-95 disabled:bg-slate-200 disabled:shadow-none"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
              {formError && (
                <div className="absolute -top-10 left-0 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 border border-rose-100 animate-in fade-in slide-in-from-bottom-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {formError}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

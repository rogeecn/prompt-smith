"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Settings, AlertCircle, Bot, User } from "lucide-react";
import type {
  ArtifactChatRequest,
  ArtifactChatResponse,
  ArtifactVariable,
  HistoryItem,
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

const buildInitialInputs = (variables: ArtifactVariable[]) =>
  variables.reduce<Record<string, string>>((acc, variable) => {
    acc[variable.key] = formatDefaultValue(variable);
    return acc;
  }, {});

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
  const [variableInputs, setVariableInputs] = useState<Record<string, string>>({});
  const [variableErrors, setVariableErrors] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [isConfigHidden, setIsConfigHidden] = useState(false);
  
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
    setInput("");
    setIsLoading(false);
    setFormError(null);
    setRetryMessage(null);
    setIsConfigHidden(false);
  }, [projectId, artifactId, sessionId, initialMessages]);

  useEffect(() => {
    setVariableInputs(buildInitialInputs(variables));
    setVariableErrors({});
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
    setVariableInputs((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
    setVariableErrors((prev) => {
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
      const raw = variableInputs[variable.key] ?? "";
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

    setVariableErrors(inputErrors);
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

  const hasConversation = messages.length > 0;
  
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* Configuration Panel - Island Style */}
      {variables.length > 0 && !isConfigHidden && !hasConversation && (
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-8">
          <div className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/50 ring-1 ring-slate-100 sm:p-8">
            <div className="mb-8 flex items-center gap-3 border-b border-slate-100 pb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">变量配置</h3>
                <p className="text-xs text-slate-500 mt-0.5">配置以下参数以生成个性化内容</p>
              </div>
            </div>

            <div className="grid gap-6">
              {variables.map((variable) => {
                const label = variable.label || variable.key;
                const value = variableInputs[variable.key] ?? "";
                const error = variableErrors[variable.key];
                
                return (
                  <div key={variable.key} className="group">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-700">{label}</label>
                      <span className={`text-[10px] uppercase font-bold tracking-wider ${variable.required ? "text-rose-400" : "text-slate-300"}`}>
                        {variable.required ? "Required" : "Optional"}
                      </span>
                    </div>
                    
                    {variable.type === "text" || variable.type === "list" ? (
                      <textarea
                        value={value}
                        onChange={(e) => updateVariableInput(variable.key, e.target.value)}
                        placeholder={variable.placeholder ?? "请输入内容..."}
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      />
                    ) : variable.type === "enum" && variable.options ? (
                      <select
                        value={value}
                        onChange={(e) => updateVariableInput(variable.key, e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      >
                        <option value="">请选择...</option>
                        {variable.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : variable.type === "boolean" ? (
                      <select
                        value={value}
                        onChange={(e) => updateVariableInput(variable.key, e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      >
                        <option value="">请选择...</option>
                        <option value="true">{variable.true_label ?? "是"}</option>
                        <option value="false">{variable.false_label ?? "否"}</option>
                      </select>
                    ) : (
                      <input
                        type={variable.type === "number" ? "number" : "text"}
                        value={value}
                        onChange={(e) => updateVariableInput(variable.key, e.target.value)}
                        placeholder={variable.placeholder ?? "请输入..."}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      />
                    )}
                    
                    {error && (
                      <div className="mt-2 flex items-center gap-1.5 text-rose-500 animate-in fade-in slide-in-from-top-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span className="text-xs font-bold">{error}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
              {formError ? (
                <span className="text-xs font-bold text-rose-500 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> {formError}
                </span>
              ) : <span />}
              
              <button
                onClick={handleInitialGenerate}
                disabled={isLoading || isDisabled}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 hover:translate-y-[-1px] disabled:opacity-50 disabled:translate-y-0"
              >
                <Bot className="h-4 w-4" />
                {isLoading ? "生成中..." : "开始生成"}
              </button>
            </div>
          </div>
        </div>
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

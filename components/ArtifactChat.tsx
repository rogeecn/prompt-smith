"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, AlertCircle } from "lucide-react";
import QuestionForm from "./chat/QuestionForm";
import type {
  ArtifactChatRequest,
  ArtifactChatResponse,
  ArtifactVariable,
  DraftAnswer,
  HistoryItem,
  Question,
} from "../lib/schemas";

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

const MAX_TEXTAREA_HEIGHT = 140;

const stripThinkingBlock = (content: string) =>
  content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();

const normalizeMarkdown = (content: string) => content.replace(/\n/g, "  \n");

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
          { id: "true", label: variable.true_label ?? "Yes" },
          { id: "false", label: variable.false_label ?? "No" },
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

const buildSummaryValue = (
  variable: ArtifactVariable,
  value: string | number | boolean | string[] | undefined
) => {
  if (value === undefined || value === null) return "未填写";
  if (Array.isArray(value)) return value.length > 0 ? value.join("、") : "未填写";
  if (typeof value === "string") return value.trim() ? value.trim() : "未填写";
  if (typeof value === "boolean") {
    return value ? variable.true_label ?? "是" : variable.false_label ?? "否";
  }
  return String(value);
};

const buildFormSummary = (
  variables: ArtifactVariable[],
  inputPayload: Record<string, string | number | boolean | string[]>
) => {
  const lines = variables.map((variable) => {
    const label = variable.label || variable.key;
    const value = buildSummaryValue(variable, inputPayload[variable.key]);
    return `- ${label}：${value}`;
  });
  return `已完成表单配置，请基于以下信息生成内容：\n${lines.join("\n")}`;
};

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
    const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
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

  const sendMessage = async (
    message: string,
    options?: { appendUser?: boolean; summary?: boolean }
  ): Promise<boolean> => {
    if (isLoading || isDisabled || !sessionId) return false;
    const trimmed = message.trim();
    if (!trimmed && !options?.summary) return false;

    const inputErrors: Record<string, string> = {};
    const inputPayload: Record<string, string | number | boolean | string[]> = {};

    variables.forEach((variable) => {
      const draft = draftAnswers[variable.key];
      const raw = typeof draft?.value === "string" ? draft.value.trim() : "";
      const fallback = raw || formatDefaultValue(variable);
      const hasValue = typeof fallback === "string" ? fallback.trim() !== "" : true;

      if (!hasValue) {
        if (variable.required ?? true) inputErrors[variable.key] = "Required";
        return;
      }

      if (variable.type === "number") {
        const num = Number(fallback);
        if (Number.isNaN(num)) inputErrors[variable.key] = "Must be a number";
        else inputPayload[variable.key] = num;
      } else if (variable.type === "boolean") {
        if (fallback === "true") inputPayload[variable.key] = true;
        else if (fallback === "false") inputPayload[variable.key] = false;
        else inputErrors[variable.key] = "Select Yes/No";
      } else if (variable.type === "list") {
        const list = parseListInput(fallback);
        if ((variable.required ?? true) && list.length === 0) inputErrors[variable.key] = "Required";
        else inputPayload[variable.key] = list;
      } else if (variable.type === "enum") {
        if (variable.options && !variable.options.includes(fallback)) inputErrors[variable.key] = "Invalid option";
        else inputPayload[variable.key] = fallback;
      } else {
        inputPayload[variable.key] = fallback;
      }
    });

    setFieldErrors(inputErrors);
    if (Object.keys(inputErrors).length > 0) {
      setFormError("Please complete configuration first.");
      return false;
    }

    const resolvedMessage =
      options?.summary ? buildFormSummary(variables, inputPayload) : trimmed;

    if (options?.appendUser ?? true) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: resolvedMessage, timestamp: Date.now() },
      ]);
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
          projectId,
          artifactId,
          sessionId,
          message: resolvedMessage,
          traceId,
          inputs: inputPayload,
        } as ArtifactChatRequest),
      });

      if (!response.ok) throw new Error("Request failed");
      const payload = (await response.json()) as ArtifactChatResponse;
      
      if (payload.sessionId && payload.sessionId !== sessionId) {
        onSessionIdChange?.(payload.sessionId);
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: payload.reply, timestamp: Date.now() },
      ]);
      setInput("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Request failed";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: msg, timestamp: Date.now() },
      ]);
      setFormError(msg);
      setRetryMessage(resolvedMessage);
    } finally {
      setIsLoading(false);
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const handleInitialGenerateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const success = await sendMessage("", { appendUser: true, summary: true });
    if (success) setIsConfigHidden(true);
  };

  const hasConversation = messages.length > 0;
  const shouldShowForm = variables.length > 0 && !isConfigHidden && !hasConversation;
  const shouldShowMessages = hasConversation || isConfigHidden || variables.length === 0;
  const shouldShowInput = hasConversation || variables.length === 0;
  
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* Configuration Panel - Reuse Question Form */}
      {shouldShowForm && (
        <div className="flex-1 min-h-0 overflow-y-auto">
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
        </div>
      )}

      {/* Message Stream */}
      {shouldShowMessages && (
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {messages.map((item, index) => {
            const isUser = item.role === "user";
            const cleanedContent =
              item.role === "assistant" ? stripThinkingBlock(item.content) : item.content;
            const displayContent = normalizeMarkdown(cleanedContent);
            return (
              <div key={`${item.timestamp}-${index}`} className="w-full">
                <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
                   <div className="mb-2">
                      <span className={`text-xs font-bold uppercase tracking-wider ${isUser ? "text-gray-400" : "text-black"}`}>
                        {isUser ? "You" : "Assistant"}
                      </span>
                   </div>
                   <div className={`
                     prose prose-sm max-w-none leading-relaxed break-words font-body
                     ${isUser ? "text-gray-800" : "text-black"}
                     prose-headings:font-heading prose-headings:font-bold prose-headings:text-black
                     prose-p:leading-7
                     prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 prose-pre:text-gray-800
                     prose-code:text-black prose-code:font-mono prose-code:bg-gray-100 prose-code:px-1
                   `}>
                     <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
                   </div>
                </div>
              </div>
            );
          })}
          
          {isLoading && (
            <div className="w-full">
              <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="text-xs font-bold uppercase tracking-wider text-black mb-4">
                  Assistant
                </div>
                <div className="flex gap-2">
                   <div className="h-2 w-2 bg-black rounded-full animate-bounce" />
                   <div className="h-2 w-2 bg-black rounded-full animate-bounce delay-100" />
                   <div className="h-2 w-2 bg-black rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Simplified Input Area */}
      {shouldShowInput && (
      <div className="bg-gray-50 px-6 pb-6 pt-4">
        <div className="mx-auto max-w-4xl">
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <textarea
                  ref={textareaRef}
                  id="artifact-chat-input"
                  name="artifactChatInput"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage(input);
                    }
                  }}
                  placeholder="Type your message..."
                  className="
                    w-full resize-none 
                    border-0 bg-transparent 
                    text-lg text-black placeholder:text-gray-300
                    focus:outline-none focus:ring-0
                    min-h-[40px] max-h-[140px]
                    font-heading
                    leading-relaxed
                  "
                  rows={1}
                />
                {formError && (
                  <div className="mt-2 flex items-center gap-2 text-rose-500 text-xs font-bold">
                    <AlertCircle className="h-4 w-4" />
                    {formError}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={isLoading || isDisabled || !input.trim()}
                className="
                  self-center
                  bg-black text-white 
                  px-6 py-3 
                  text-sm font-semibold tracking-wide
                  hover:bg-gray-800 
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed
                  transition-all duration-200
                "
              >
                {isLoading ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </div>
      </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MessageStream from "./chat/MessageStream";
import QuestionForm from "./chat/QuestionForm";
import {
  type Answer,
  type DraftAnswer,
  type HistoryItem,
  type Question,
  type SessionState,
  type ModelCatalog,
  ModelCatalogSchema,
  type OutputFormat,
} from "../lib/schemas";
import { createArtifactFromPrompt, updateSessionTitle } from "../src/app/actions";
import { useChatSession } from "../hooks/useChatSession";
import { deriveTitleFromPrompt } from "../lib/template";

const DEFAULT_START_MESSAGE = "Start Wizard";
const FORM_MESSAGE_PREFIX = "__FORM__:";

type ChatInterfaceProps = {
  projectId: string;
  sessionId: string;
  initialMessages?: HistoryItem[];
  initialState?: SessionState;
  isDisabled?: boolean;
  onSessionTitleUpdate?: (title: string) => void;
};

const getQuestionKey = (question: Question, index: number) =>
  question.id ?? `q-${index}`;

const serializeFormMessage = (payload: {
  questions: Question[];
  answers: Record<string, DraftAnswer>;
}) => `${FORM_MESSAGE_PREFIX}${JSON.stringify(payload)}`;

const parseFormMessage = (content: string) => {
  if (!content.startsWith(FORM_MESSAGE_PREFIX)) return null;
  const raw = content.slice(FORM_MESSAGE_PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as {
      questions: Question[];
      answers: Record<string, DraftAnswer>;
    };
    if (!parsed || !Array.isArray(parsed.questions)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export default function ChatInterface({
  projectId,
  sessionId,
  initialMessages = [],
  initialState,
  isDisabled = false,
  onSessionTitleUpdate,
}: ChatInterfaceProps) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [sessionTitle, setSessionTitle] = useState(initialState?.title ?? "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const [exportStatus, setExportStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null);
  const [modelCatalogError, setModelCatalogError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const hasCustomTitleRef = useRef(false);

  const {
    messages,
    pendingQuestions,
    draftAnswers,
    setDraftAnswers,
    setPendingQuestions,
    isLoading,
    formError,
    retryPayload,
    finalPrompt,
    isFinished,
    deliberations,
    saveStatus,
    loadingStage,
    sendRequest,
    modelId,
    setModelId,
    outputFormat,
    setOutputFormat,
  } = useChatSession({
    projectId,
    sessionId,
    initialMessages,
    initialState,
    isDisabled,
    onSessionTitleUpdate,
    defaultModelId: modelCatalog?.defaultModelId ?? null,
    defaultOutputFormat: modelCatalog?.defaultFormat ?? null,
  });

  useEffect(() => {
    let isActive = true;
    const loadModelCatalog = async () => {
      try {
        const response = await fetch("/api/models");
        if (!response.ok) {
          throw new Error("模型配置读取失败");
        }
        const payload = await response.json();
        const parsed = ModelCatalogSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error("模型配置格式错误");
        }
        if (isActive) {
          setModelCatalog(parsed.data);
          setModelCatalogError(null);
        }
      } catch (error) {
        if (isActive) {
          setModelCatalogError(
            error instanceof Error ? error.message : "模型配置读取失败"
          );
        }
      }
    };
    void loadModelCatalog();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    setInput("");
    setFieldErrors({});
    const initialTitle = initialState?.title ?? "";
    hasCustomTitleRef.current = Boolean(initialTitle);
    setSessionTitle(initialTitle);
    setTitleDraft(initialTitle);
    setIsEditingTitle(false);
  }, [projectId, sessionId, initialMessages, initialState]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, 140);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 140 ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    if (!listRef.current) return;
    if (pendingQuestions.length > 0) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isLoading, deliberations, finalPrompt, pendingQuestions.length]);

  useEffect(() => {
    if (pendingQuestions.length === 0 || !formRef.current) return;
    formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pendingQuestions.length]);

  useEffect(() => {
    if (!finalPrompt || hasCustomTitleRef.current) {
      return;
    }
    const derived = deriveTitleFromPrompt(finalPrompt);
    setSessionTitle(derived);
    setTitleDraft(derived);
    void updateSessionTitle(projectId, sessionId, derived);
    onSessionTitleUpdate?.(derived);
    hasCustomTitleRef.current = true;
  }, [finalPrompt, onSessionTitleUpdate, projectId, sessionId]);

  const commitTitle = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(sessionTitle);
      setIsEditingTitle(false);
      return;
    }
    if (trimmed === sessionTitle) {
      setIsEditingTitle(false);
      return;
    }
    setSessionTitle(trimmed);
    hasCustomTitleRef.current = true;
    setIsEditingTitle(false);
    try {
      await updateSessionTitle(projectId, sessionId, trimmed);
      onSessionTitleUpdate?.(trimmed);
    } catch {
      // ignore error, keep local title
    }
  };

  const handleStartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalMessage = input.trim() || DEFAULT_START_MESSAGE;
    await sendRequest({ message: finalMessage, optimisticUserMessage: { role: "user", content: finalMessage, timestamp: Date.now() } });
    setInput("");
  };

  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const answers: Answer[] = [];
    pendingQuestions.forEach((q, i) => {
      const key = getQuestionKey(q, i);
      const draft = draftAnswers[key];

      if (!draft) return;

      if (q.type === "text") {
        const text = typeof draft.value === "string" ? draft.value.trim() : "";
        if (!text) return;
        answers.push({ type: "text", value: text, question_id: q.id });
        return;
      }

      if (q.type === "single") {
        const value = typeof draft.value === "string" ? draft.value : "";
        if (!value) return;
        answers.push({
          type: "single",
          value,
          question_id: q.id,
          other: value === "__other__" && draft.other?.trim() ? draft.other.trim() : undefined,
        });
        return;
      }

      if (q.type === "multi") {
        const values = Array.isArray(draft.value)
          ? draft.value.filter((item) => typeof item === "string" && item.trim())
          : [];
        if (values.length === 0) return;
        answers.push({
          type: "multi",
          value: values,
          question_id: q.id,
          other: values.includes("__other__") && draft.other?.trim() ? draft.other.trim() : undefined,
        });
      }
    });
    
    const displayMessage = serializeFormMessage({ questions: pendingQuestions, answers: draftAnswers });
    setPendingQuestions([]);
    await sendRequest({ answers, message: displayMessage, optimisticUserMessage: { role: "user", content: displayMessage, timestamp: Date.now() } });
    setInput("");
  };

  const handleCopyFinalPrompt = async () => {
    if (!finalPrompt) return;
    try {
      await navigator.clipboard.writeText(finalPrompt);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
    setTimeout(() => setCopyState("idle"), 2000);
  };

  const handleExportArtifact = async () => {
    if (!finalPrompt || exportStatus === "saving") return;
    setExportStatus("saving");
    try {
      const artifact = await createArtifactFromPrompt(projectId, finalPrompt);
      setExportStatus("success");
      router.push(`/projects/${projectId}/artifacts/${artifact.id}`);
    } catch {
      setExportStatus("error");
    }
  };

  const showChatInput = !isLoading && pendingQuestions.length === 0 && (messages.length === 0 || isFinished || !!finalPrompt);
  const showQuestionForm = pendingQuestions.length > 0 && !finalPrompt && !isFinished;
  const showInlineError = Boolean(formError) && !showQuestionForm;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* Top Bar - Minimal */}
      <div className="border-b border-gray-100 bg-white/95 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div className="max-w-[55%]">
            {isEditingTitle ? (
              <input
                id="session-title"
                name="sessionTitle"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void commitTitle()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitTitle();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setTitleDraft(sessionTitle);
                    setIsEditingTitle(false);
                  }
                }}
                className="w-full border-b border-gray-200 bg-transparent text-sm font-medium text-gray-700 outline-none focus:border-black"
                placeholder="输入向导标题"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                className="text-sm font-medium text-gray-500 font-body truncate text-left hover:text-black transition-colors"
              >
                {sessionTitle || "New Session"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {modelCatalog ? (
              <>
                <select
                  aria-label="模型选择"
                  id="model-select"
                  name="modelSelect"
                  value={modelId ?? modelCatalog.defaultModelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="rounded-none border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-black focus:outline-none"
                >
                  {modelCatalog.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="输出格式"
                  id="format-select"
                  name="formatSelect"
                  value={outputFormat ?? modelCatalog.defaultFormat}
                  onChange={(e) =>
                    setOutputFormat(e.target.value as OutputFormat)
                  }
                  className="rounded-none border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-black focus:outline-none"
                >
                  {modelCatalog.formats.map((format) => (
                    <option key={format} value={format}>
                      {format.toUpperCase()}
                    </option>
                  ))}
                </select>
              </>
            ) : modelCatalogError ? (
              <span className="text-xs text-rose-400">{modelCatalogError}</span>
            ) : (
              <span className="text-xs text-gray-400">模型加载中...</span>
            )}
            <span
              className={`text-xs text-gray-400 transition-opacity ${
                saveStatus === "saving" ? "opacity-100" : "opacity-0"
              }`}
            >
              Saving...
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div ref={listRef} className="flex-1 overflow-y-auto bg-white">
        <MessageStream
          messages={messages}
          isLoading={isLoading}
          loadingStage={loadingStage}
          parseFormMessage={parseFormMessage}
        />

        {showQuestionForm && (
          <div ref={formRef}>
            <QuestionForm
              questions={pendingQuestions}
              draftAnswers={draftAnswers}
              fieldErrors={fieldErrors}
              isLoading={isLoading}
              isDisabled={isDisabled}
              saveStatusLabel=""
              formError={formError}
              onTextChange={(k, v) => setDraftAnswers(p => ({ ...p, [k]: { type: "text", value: v } }))}
              onSingleSelect={(k, v) => setDraftAnswers(p => ({ ...p, [k]: { type: "single", value: v, other: v === "__other__" ? p[k]?.other : undefined } }))}
              onMultiToggle={(k, v) => setDraftAnswers(p => {
                const cur = Array.isArray(p[k]?.value) ? p[k].value : [];
                if (v === "__none__") return { ...p, [k]: { type: "multi", value: [v] } };
                const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur.filter(x => x !== "__none__"), v];
                return { ...p, [k]: { type: "multi", value: next, other: next.includes("__other__") ? p[k]?.other : undefined } };
              })}
              onOtherChange={(k, v) => setDraftAnswers(p => ({ ...p, [k]: { ...p[k]!, other: v } }))}
              onSelectAll={(k, opts) => setDraftAnswers(p => ({ ...p, [k]: { type: "multi", value: opts!.map(o => o.id).filter(id => id !== "__other__" && id !== "__none__") } }))}
              onSubmit={handleAnswerSubmit}
              onRetry={() => retryPayload && sendRequest(retryPayload)}
            />
          </div>
        )}

        {/* Final Prompt Display - Editorial Style */}
        {finalPrompt && (
          <div className="border-t-4 border-accent bg-white pb-20 pt-12">
            <div className="mx-auto max-w-3xl px-6">
              <div className="flex items-center justify-between mb-8">
                <h2 className="font-display text-2xl font-bold text-black">
                  Final Prompt
                </h2>
                <div className="flex gap-4">
                  <button 
                    onClick={handleCopyFinalPrompt}
                    className="text-sm font-medium text-black hover:text-accent transition-colors underline decoration-1 underline-offset-4"
                  >
                    {copyState === "success" ? "Copied" : "Copy to Clipboard"}
                  </button>
                  <button 
                    onClick={handleExportArtifact}
                    disabled={exportStatus === "saving"}
                    className="text-sm font-medium text-black hover:text-accent transition-colors underline decoration-1 underline-offset-4 disabled:opacity-50"
                  >
                    {exportStatus === "saving" ? "Saving..." : "Save as Artifact"}
                  </button>
                </div>
              </div>
              
              <div className="bg-surface-muted border border-gray-200 p-8">
                <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 leading-relaxed overflow-x-auto">
                  {finalPrompt}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Simplified Input Area */}
      {showChatInput && (
      <div className="bg-gray-50 px-6 pb-6 pt-4">
        <div className="mx-auto max-w-3xl">
          <form onSubmit={handleStartSubmit} className="relative">
            {showInlineError && (
              <div className="mb-3 text-sm font-medium text-rose-500">
                {formError}
              </div>
            )}
            <div className="flex items-start gap-4">
              <textarea
                ref={textareaRef}
                id="chat-input"
                name="chatInput"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleStartSubmit(e);
                  }
                }}
                placeholder={Boolean(finalPrompt) || isFinished ? "Refine your prompt..." : "Describe what you want to create..."}
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
                style={{ fontFamily: "var(--font-heading)" }}
              />
              <button 
                type="submit"
                disabled={isLoading || isDisabled || (!input.trim() && messages.length > 0)}
                className="
                  self-center
                  bg-black text-white 
                  px-8 py-3 
                  text-sm font-semibold tracking-wide
                  hover:bg-gray-800 
                  disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed
                  transition-all duration-200
                "
              >
                {isLoading ? "Thinking..." : "Send"}
              </button>
            </div>
          </form>
        </div>
      </div>
      )}
    </div>
  );
}

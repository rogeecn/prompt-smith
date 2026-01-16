"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlignLeft, Code, Minus, Plus, Send, Copy, Download, Archive, Share2, Sparkles, AlertCircle } from "lucide-react";
import MessageStream from "./chat/MessageStream";
import QuestionForm from "./chat/QuestionForm";
import {
  type Answer,
  type DraftAnswer,
  type HistoryItem,
  type ModelCatalog,
  type OutputFormat,
  type Question,
  type SessionState,
  ModelCatalogSchema,
} from "../lib/schemas";
import { createArtifactFromPrompt, updateSessionTitle } from "../src/app/actions";
import { useChatSession } from "../hooks/useChatSession";
import { deriveTitleFromPrompt } from "../lib/template";

const OTHER_OPTION_ID = "__other__";
const NONE_OPTION_ID = "__none__";
const DEFAULT_START_MESSAGE = "开始向导";
const FORM_MESSAGE_PREFIX = "__FORM__:";
const DEFAULT_OUTPUT_FORMATS = ["markdown", "xml"] as const;
const OUTPUT_FORMAT_LABELS: Record<string, string> = {
  markdown: "Markdown",
  xml: "XML",
};
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
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const [exportStatus, setExportStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState(initialState?.title ?? "");
  const [titleDraft, setTitleDraft] = useState(initialState?.title ?? "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null);
  const [modelCatalogError, setModelCatalogError] = useState<string | null>(null);
  const [isModelCatalogLoading, setIsModelCatalogLoading] = useState(false);
  
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
    modelId,
    setModelId,
    outputFormat,
    setOutputFormat,
    loadingStage,
    sendRequest,
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
    let active = true;
    setIsModelCatalogLoading(true);
    setModelCatalogError(null);

    fetch("/api/models")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("模型列表请求失败");
        }
        const data = await res.json();
        const parsed = ModelCatalogSchema.safeParse(data);
        if (!parsed.success) {
          throw new Error("模型配置解析失败");
        }
        if (active) {
          setModelCatalog(parsed.data);
        }
      })
      .catch(() => {
        if (active) {
          setModelCatalogError("模型列表加载失败");
        }
      })
      .finally(() => {
        if (active) {
          setIsModelCatalogLoading(false);
        }
      });

    return () => {
      active = false;
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
    setTitleError(null);
  }, [projectId, sessionId, initialMessages, initialState]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input]);

  const insertAtCursor = (value: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setInput((prev) => prev + value);
      return;
    }
    const start = textarea.selectionStart ?? input.length;
    const end = textarea.selectionEnd ?? input.length;
    const nextValue = `${input.slice(0, start)}${value}${input.slice(end)}`;
    setInput(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + value.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  };

  const appendQuickAction = (label: string) => {
    setInput((prev) => (prev.trim() ? `${prev.trim()}\n${label}` : label));
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isLoading, deliberations, finalPrompt, pendingQuestions]);

  useEffect(() => {
    if (!finalPrompt || hasCustomTitleRef.current) {
      return;
    }
    const derived = deriveTitleFromPrompt(finalPrompt);
    setSessionTitle(derived);
    setTitleDraft(derived);
    onSessionTitleUpdate?.(derived);
  }, [finalPrompt, onSessionTitleUpdate]);

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

      if (!draft) {
        return;
      }

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
          other: value === OTHER_OPTION_ID && draft.other?.trim() ? draft.other.trim() : undefined,
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
          other: values.includes(OTHER_OPTION_ID) && draft.other?.trim() ? draft.other.trim() : undefined,
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
      router.push(`/artifacts/${artifact.id}?projectId=${projectId}`);
    } catch {
      setExportStatus("error");
      setExportError("导出失败");
    }
  };

  const handleEditTitle = () => {
    setTitleDraft(sessionTitle);
    setTitleError(null);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    const trimmed = titleDraft.trim();
    if (trimmed === sessionTitle.trim()) {
      setTitleError(null);
      setIsEditingTitle(false);
      return;
    }
    if (!trimmed) {
      setTitleError("标题不能为空。");
      setTitleDraft(sessionTitle);
      setIsEditingTitle(false);
      return;
    }
    if (isSavingTitle) {
      return;
    }
    setIsSavingTitle(true);
    setTitleError(null);
    try {
      await updateSessionTitle(projectId, sessionId, trimmed);
      hasCustomTitleRef.current = true;
      setSessionTitle(trimmed);
      setTitleDraft(trimmed);
      setIsEditingTitle(false);
      onSessionTitleUpdate?.(trimmed);
    } catch {
      setTitleError("保存失败，请重试。");
    } finally {
      setIsSavingTitle(false);
    }
  };

  const showChatInput = !isLoading && pendingQuestions.length === 0 && (messages.length === 0 || isFinished || !!finalPrompt);
  const showQuestionForm = pendingQuestions.length > 0 && !finalPrompt && !isFinished;
  const resolvedModelId =
    modelId ??
    modelCatalog?.defaultModelId ??
    modelCatalog?.models[0]?.id ??
    "";
  const resolvedOutputFormat =
    outputFormat ?? modelCatalog?.defaultFormat ?? DEFAULT_OUTPUT_FORMATS[0];
  const availableFormats = modelCatalog?.formats ?? DEFAULT_OUTPUT_FORMATS;
  const isModelSelectDisabled = isModelCatalogLoading || !modelCatalog;
  const saveStatusLabel =
    saveStatus === "saving"
      ? "正在保存草稿..."
      : saveStatus === "saved"
        ? "草稿已保存"
        : saveStatus === "error"
          ? "草稿保存失败"
          : "";

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      <div className="border-b border-slate-100 bg-white/90">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            {isEditingTitle ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void handleSaveTitle()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSaveTitle();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setTitleDraft(sessionTitle);
                    setTitleError(null);
                    setIsEditingTitle(false);
                  }
                }}
                className="mt-1 w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500"
                placeholder="输入向导标题"
              />
            ) : (
              <button
                type="button"
                onClick={handleEditTitle}
                className="w-full text-left text-sm font-semibold text-slate-900 hover:text-indigo-600"
              >
                {sessionTitle || "未命名向导"}
              </button>
            )}
            {titleError && (
              <p className="mt-1 text-xs text-rose-500">{titleError}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <select
                value={resolvedModelId}
                onChange={(e) => setModelId(e.target.value || null)}
                disabled={isModelSelectDisabled}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {isModelSelectDisabled && (
                  <option value="">
                    {modelCatalogError ? "模型加载失败" : "加载中..."}
                  </option>
                )}
                {modelCatalog?.models.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={resolvedOutputFormat}
                onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none focus:border-indigo-500"
              >
                {availableFormats.map((format) => (
                  <option key={format} value={format}>
                    {OUTPUT_FORMAT_LABELS[format] ?? format}
                  </option>
                ))}
              </select>
            </div>
            {isSavingTitle ? (
              <span className="text-xs text-slate-400">保存中...</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        <MessageStream
          messages={messages}
          deliberations={deliberations}
          isLoading={isLoading}
          loadingStage={loadingStage}
          parseFormMessage={parseFormMessage}
        />

        {showQuestionForm && (
          <QuestionForm
            questions={pendingQuestions}
            draftAnswers={draftAnswers}
            fieldErrors={fieldErrors}
            isLoading={isLoading}
            isDisabled={isDisabled}
            saveStatusLabel={saveStatusLabel}
            formError={formError}
            onTextChange={(k, v) => setDraftAnswers(p => ({ ...p, [k]: { type: "text", value: v } }))}
            onSingleSelect={(k, v) => setDraftAnswers(p => ({ ...p, [k]: { type: "single", value: v, other: v === OTHER_OPTION_ID ? p[k]?.other : undefined } }))}
            onMultiToggle={(k, v, m) => setDraftAnswers(p => {
              const cur = Array.isArray(p[k]?.value) ? p[k].value : [];
              if (v === NONE_OPTION_ID) return { ...p, [k]: { type: "multi", value: [v] } };
              const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur.filter(x => x !== NONE_OPTION_ID), v];
              if (m && next.length > m) return p;
              return { ...p, [k]: { type: "multi", value: next, other: next.includes(OTHER_OPTION_ID) ? p[k]?.other : undefined } };
            })}
            onOtherChange={(k, v) => setDraftAnswers(p => ({ ...p, [k]: { ...p[k]!, other: v } }))}
            onSelectAll={(k, opts) => setDraftAnswers(p => ({ ...p, [k]: { type: "multi", value: opts!.map(o => o.id).filter(id => id !== OTHER_OPTION_ID && id !== NONE_OPTION_ID) } }))}
            onSubmit={handleAnswerSubmit}
            onRetry={() => retryPayload && sendRequest(retryPayload)}
          />
        )}

        {finalPrompt && (
          <div className="w-full bg-block-system border-y border-slate-200">
            <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
              <div className="border border-slate-200 bg-white p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center border border-slate-200 bg-white text-emerald-600">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">最终生成的 Prompt 制品</h3>
                      <p className="text-xs text-slate-500 mt-0.5">可以直接复制使用，或作为制品永久沉淀</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleCopyFinalPrompt} className="flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50">
                      <Copy className="h-3.5 w-3.5" />
                      {copyState === "success" ? "已复制" : "复制"}
                    </button>
                    <button onClick={handleExportArtifact} disabled={exportStatus === "saving"} className="flex items-center gap-2 border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50">
                      <Archive className="h-3.5 w-3.5" />
                      {exportStatus === "saving" ? "导出中..." : "导出为制品"}
                    </button>
                  </div>
                </div>
                
                <div className="relative group">
                  <pre className="max-h-[400px] overflow-y-auto whitespace-pre-wrap border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 font-mono">
                    {finalPrompt}
                  </pre>
                  <div className="absolute right-4 top-4 flex gap-2">
                    <button onClick={() => {}} title="下载为 TXT" className="border border-slate-200 bg-white p-2 text-slate-500 transition hover:text-slate-700">
                      <Download className="h-4 w-4" />
                    </button>
                    <button onClick={() => {}} title="分享 JSON" className="border border-slate-200 bg-white p-2 text-slate-500 transition hover:text-slate-700">
                      <Share2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showChatInput && (
        <div className="border-t-2 border-[#DCD0FF] bg-white pb-6 pt-4">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <form onSubmit={handleStartSubmit} className="relative group">
              <div className="flex flex-col">
                <div className="px-5 pt-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#7C4DFF]">
                    {Boolean(finalPrompt) || isFinished ? "继续优化提示词" : "开始你的需求描述"}
                  </span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleStartSubmit(e); } }}
                  placeholder={Boolean(finalPrompt) || isFinished ? "例如：语气更幽默一些，增加具体的案例..." : "例如：我要做一个关于职场效率提升的公众号推文助手..."}
                  className="w-full resize-none bg-white px-5 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 min-h-[96px] border-b border-slate-200"
                  rows={4}
                />
                <div className="flex items-center justify-between px-5 pb-3 pt-2">
                  <button
                    type="button"
                    onClick={() => insertAtCursor("{{variable}}")}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900"
                    title="插入变量占位符"
                  >
                    <Code className="h-4 w-4" />
                    <span>{"{{x}}"}</span>
                  </button>
                  <div className="flex flex-col items-end gap-2">
                    <button 
                      type="submit" 
                      disabled={isLoading || isDisabled || (!input.trim() && messages.length > 0)}
                      className="flex h-9 w-9 items-center justify-center bg-[#7C4DFF] text-white transition-colors hover:bg-[#6F3FF0] disabled:bg-slate-200"
                      title="发送"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => appendQuickAction("请精简表达。")}
                        className="p-1 text-slate-500 hover:text-slate-900"
                        title="精简"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => appendQuickAction("请扩充细节。")}
                        className="p-1 text-slate-500 hover:text-slate-900"
                        title="扩充"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => appendQuickAction("请整理为清晰的段落结构。")}
                        className="p-1 text-slate-500 hover:text-slate-900"
                        title="格式化"
                      >
                        <AlignLeft className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {formError && (
                <div className="absolute -top-10 left-0 flex items-center gap-2 border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 animate-in fade-in slide-in-from-bottom-2">
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

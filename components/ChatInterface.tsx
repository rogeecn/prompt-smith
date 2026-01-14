"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Copy, Download, Archive, Share2, Sparkles, AlertCircle } from "lucide-react";
import MessageStream from "./chat/MessageStream";
import QuestionForm from "./chat/QuestionForm";
import {
  ChatRequestSchema,
  LLMResponseSchema,
  type Answer,
  type DraftAnswer,
  type LLMResponse,
  type HistoryItem,
  type Question,
  type SessionState,
} from "../lib/schemas";
import { createArtifactFromPrompt, updateSessionState } from "../src/app/actions";
import { deriveTitleFromPrompt } from "../lib/template";

const OTHER_OPTION_ID = "__other__";
const NONE_OPTION_ID = "__none__";
const DEFAULT_START_MESSAGE = "开始向导";
const FORM_MESSAGE_PREFIX = "__FORM__:";
const isDebug = process.env.NODE_ENV !== "production";

const logDebug = (label: string, payload?: unknown) => {
  if (!isDebug) return;
  console.log(`[ChatInterface] ${label}`, payload || "");
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
  const [messages, setMessages] = useState<HistoryItem[]>(initialMessages);
  const [pendingQuestions, setPendingQuestions] = useState<Question[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, DraftAnswer>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [retryPayload, setRetryPayload] = useState<{
    message?: string;
    answers?: Answer[];
  } | null>(null);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [deliberations, setDeliberations] = useState<LLMResponse["deliberations"]>([]);
  const [exportStatus, setExportStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef<SessionState | null>(null);
  const pendingSaveRef = useRef(false);

  useEffect(() => {
    setMessages(initialMessages);
    setPendingQuestions(initialState?.questions ?? []);
    setDraftAnswers(initialState?.draft_answers ?? {});
    setFinalPrompt(initialState?.final_prompt ?? null);
    setIsFinished(initialState?.is_finished ?? false);
    setDeliberations(initialState?.deliberations ?? []);
    setFormError(null);
    setInput("");
    setFieldErrors({});
  }, [projectId, sessionId, initialMessages, initialState]);

  useEffect(() => {
    if (finalPrompt) {
      onSessionTitleUpdate?.(deriveTitleFromPrompt(finalPrompt));
    }
  }, [finalPrompt, onSessionTitleUpdate]);

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
  }, [messages, isLoading, deliberations, finalPrompt, pendingQuestions]);

  // Auto-save draft logic
  useEffect(() => {
    if (!projectId || !sessionId || pendingQuestions.length === 0) return;

    const state: SessionState = {
      questions: pendingQuestions,
      deliberations,
      final_prompt: finalPrompt,
      is_finished: isFinished,
      draft_answers: draftAnswers,
    };
    latestStateRef.current = state;
    pendingSaveRef.current = true;
    setSaveStatus("saving");

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void updateSessionState(projectId, sessionId, state)
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("error"));
    }, 1000);

    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [projectId, sessionId, pendingQuestions, draftAnswers, deliberations, finalPrompt, isFinished]);

  const sendRequest = async ({
    message,
    answers,
    optimisticUserMessage,
    appendUserMessage = true,
  }: {
    message?: string;
    answers?: Answer[];
    optimisticUserMessage?: HistoryItem;
    appendUserMessage?: boolean;
  }) => {
    if (isLoading || isDisabled) return;

    if (appendUserMessage && optimisticUserMessage) {
      setMessages((prev) => [...prev, optimisticUserMessage]);
    }
    setIsLoading(true);
    setFormError(null);
    setDeliberations([]);
    
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sessionId, message, answers }),
      });

      if (!response.ok) throw new Error("Request failed");
      const payload = LLMResponseSchema.parse(await response.json());

      if (payload.final_prompt) setFinalPrompt(payload.final_prompt);
      setIsFinished(payload.is_finished);
      setDeliberations(payload.deliberations ?? []);
      setMessages((prev) => [...prev, { role: "assistant", content: payload.reply, timestamp: Date.now() }]);
      setPendingQuestions(payload.questions ?? []);
      setDraftAnswers({});
      setInput("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "请求失败");
      setRetryPayload({ message, answers });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalMessage = input.trim() || DEFAULT_START_MESSAGE;
    await sendRequest({ message: finalMessage, optimisticUserMessage: { role: "user", content: finalMessage, timestamp: Date.now() } });
  };

  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const answers: Answer[] = pendingQuestions.map((q, i) => {
      const key = getQuestionKey(q, i);
      const draft = draftAnswers[key];
      return { 
        type: q.type, 
        value: draft?.value ?? "", 
        question_id: q.id, 
        other: draft?.other 
      };
    });
    
    const displayMessage = serializeFormMessage({ questions: pendingQuestions, answers: draftAnswers });
    setPendingQuestions([]);
    await sendRequest({ answers, message: displayMessage, optimisticUserMessage: { role: "user", content: displayMessage, timestamp: Date.now() } });
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

  const showChatInput = !isLoading && pendingQuestions.length === 0 && (messages.length === 0 || isFinished || !!finalPrompt);
  const showQuestionForm = pendingQuestions.length > 0 && !finalPrompt && !isFinished;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* Scrollable Content */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        <MessageStream 
          messages={messages} 
          deliberations={deliberations} 
          isLoading={isLoading} 
          parseFormMessage={parseFormMessage}
        />

        {showQuestionForm && (
          <QuestionForm
            questions={pendingQuestions}
            draftAnswers={draftAnswers}
            fieldErrors={fieldErrors}
            isLoading={isLoading}
            isDisabled={isDisabled}
            saveStatusLabel={saveStatus === "saving" ? "正在保存草稿..." : saveStatus === "saved" ? "草稿已保存" : ""}
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
          <div className="w-full bg-emerald-50/30 border-y border-emerald-100/50">
            <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
              <div className="rounded-3xl bg-white p-6 shadow-xl shadow-emerald-900/5 ring-1 ring-emerald-100 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">最终生成的 Prompt 制品</h3>
                      <p className="text-xs text-slate-500 mt-0.5">可以直接复制使用，或作为制品永久沉淀</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleCopyFinalPrompt} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50">
                      <Copy className="h-3.5 w-3.5" />
                      {copyState === "success" ? "已复制" : "复制"}
                    </button>
                    <button onClick={handleExportArtifact} disabled={exportStatus === "saving"} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700 disabled:opacity-50">
                      <Archive className="h-3.5 w-3.5" />
                      {exportStatus === "saving" ? "导出中..." : "导出为制品"}
                    </button>
                  </div>
                </div>
                
                <div className="relative group">
                  <pre className="max-h-[400px] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-6 text-sm leading-relaxed text-slate-800 font-mono border border-slate-100">
                    {finalPrompt}
                  </pre>
                  <div className="absolute right-4 top-4 flex gap-2">
                    <button onClick={() => {}} title="下载为 TXT" className="rounded-lg bg-white/80 p-2 text-slate-400 backdrop-blur transition hover:text-indigo-600">
                      <Download className="h-4 w-4" />
                    </button>
                    <button onClick={() => {}} title="分享 JSON" className="rounded-lg bg-white/80 p-2 text-slate-400 backdrop-blur transition hover:text-indigo-600">
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
        <div className="border-t border-slate-100 bg-white/80 pb-8 pt-4 backdrop-blur-xl">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <form onSubmit={handleStartSubmit} className="relative group">
              <div className="relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/50 transition-all focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10">
                <div className="px-5 pt-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">
                    {Boolean(finalPrompt) || isFinished ? "继续优化提示词" : "开始你的需求描述"}
                  </span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleStartSubmit(e); } }}
                  placeholder={Boolean(finalPrompt) || isFinished ? "例如：语气更幽默一些，增加具体的案例..." : "例如：我要做一个关于职场效率提升的公众号推文助手..."}
                  className="w-full resize-none bg-transparent px-5 py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 min-h-[56px]"
                  rows={1}
                />
                <div className="flex items-center justify-between border-t border-slate-50 bg-slate-50/50 px-5 py-3">
                  <div className="flex items-center gap-4 text-[10px] font-medium text-slate-400">
                    <span className="flex items-center gap-1.5"><kbd className="rounded border bg-white px-1.5 py-0.5 font-sans">Enter</kbd> 发送修改</span>
                    <span className="flex items-center gap-1.5"><kbd className="rounded border bg-white px-1.5 py-0.5 font-sans">Shift + Enter</kbd> 换行</span>
                  </div>
                  <button 
                    type="submit" 
                    disabled={isLoading || isDisabled || (!input.trim() && messages.length > 0)}
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
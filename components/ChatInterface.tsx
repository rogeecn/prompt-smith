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
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const [exportStatus, setExportStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

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
    loadingStage,
    sendRequest,
  } = useChatSession({
    projectId,
    sessionId,
    initialMessages,
    initialState,
    isDisabled,
    onSessionTitleUpdate,
    defaultModelId: null,
    defaultOutputFormat: null,
  });

  useEffect(() => {
    setInput("");
    setFieldErrors({});
    const initialTitle = initialState?.title ?? "";
    hasCustomTitleRef.current = Boolean(initialTitle);
    setSessionTitle(initialTitle);
  }, [projectId, sessionId, initialMessages, initialState]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [input]);

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
    void updateSessionTitle(projectId, sessionId, derived);
    onSessionTitleUpdate?.(derived);
    hasCustomTitleRef.current = true;
  }, [finalPrompt, onSessionTitleUpdate, projectId, sessionId]);

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
      router.push(`/artifacts/${artifact.id}?projectId=${projectId}`);
    } catch {
      setExportStatus("error");
    }
  };

  const showChatInput = !isLoading && pendingQuestions.length === 0 && (messages.length === 0 || isFinished || !!finalPrompt);
  const showQuestionForm = pendingQuestions.length > 0 && !finalPrompt && !isFinished;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* Top Bar - Minimal */}
      <div className="border-b border-gray-100 bg-white/95 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <h1 className="text-sm font-medium text-gray-500 font-body truncate max-w-[80%]">
            {sessionTitle || "New Session"}
          </h1>
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-400">Saving...</span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div ref={listRef} className="flex-1 overflow-y-auto bg-white">
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
            saveStatusLabel=""
            formError={formError}
            onTextChange={(k, v) => setDraftAnswers(p => ({ ...p, [k]: { type: "text", value: v } }))}
            onSingleSelect={(k, v) => setDraftAnswers(p => ({ ...p, [k]: { type: "single", value: v, other: v === "__other__" ? p[k]?.other : undefined } }))}
            onMultiToggle={(k, v, m) => setDraftAnswers(p => {
              const cur = Array.isArray(p[k]?.value) ? p[k].value : [];
              if (v === "__none__") return { ...p, [k]: { type: "multi", value: [v] } };
              const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur.filter(x => x !== "__none__"), v];
              if (m && next.length > m) return p;
              return { ...p, [k]: { type: "multi", value: next, other: next.includes("__other__") ? p[k]?.other : undefined } };
            })}
            onOtherChange={(k, v) => setDraftAnswers(p => ({ ...p, [k]: { ...p[k]!, other: v } }))}
            onSelectAll={(k, opts) => setDraftAnswers(p => ({ ...p, [k]: { type: "multi", value: opts!.map(o => o.id).filter(id => id !== "__other__" && id !== "__none__") } }))}
            onSubmit={handleAnswerSubmit}
            onRetry={() => retryPayload && sendRequest(retryPayload)}
          />
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
        <div className="border-t border-gray-200 bg-white p-6">
          <div className="mx-auto max-w-3xl">
            <form onSubmit={handleStartSubmit} className="relative">
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
                  min-h-[120px]
                  font-heading
                  leading-relaxed
                "
                style={{ fontFamily: 'var(--font-heading)' }}
              />
              
              <div className="mt-4 flex justify-end border-t border-gray-100 pt-4">
                <button 
                  type="submit"
                  disabled={isLoading || isDisabled || (!input.trim() && messages.length > 0)}
                  className="
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

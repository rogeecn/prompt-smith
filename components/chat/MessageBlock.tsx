"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Question, DraftAnswer } from "../../lib/schemas";

type MessageBlockProps = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
  isForm?: boolean;
  formPayload?: {
    questions: Question[];
    answers: Record<string, DraftAnswer>;
  } | null;
};

const formatDraftAnswer = (question: Question, draft?: DraftAnswer) => {
  if (!draft) return "未填写";
  if (question.type === "text") {
    return typeof draft.value === "string" && draft.value.trim() ? draft.value.trim() : "未填写";
  }
  if (question.type === "single") {
    if (typeof draft.value !== "string" || !draft.value) return "未填写";
    if (draft.value === "__other__") return draft.other?.trim() ? `其他：${draft.other.trim()}` : "其他";
    if (draft.value === "__none__") return "不需要此功能";
    return question.options?.find((o) => o.id === draft.value)?.label ?? draft.value;
  }
  if (question.type === "multi") {
    if (!Array.isArray(draft.value) || draft.value.length === 0) return "未填写";
    if (draft.value.includes("__none__")) return "不需要此功能";
    return draft.value.map((v) => {
      if (v === "__other__") return draft.other?.trim() ? `其他：${draft.other.trim()}` : "其他";
      return question.options?.find((o) => o.id === v)?.label ?? v;
    }).join("、");
  }
  return "未填写";
};

export default function MessageBlock({
  role,
  content,
  isForm,
  formPayload,
}: MessageBlockProps) {
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  
  const roleLabel = isUser ? "You" : isAssistant ? "Assistant" : "System";

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="mx-auto max-w-3xl px-6 py-6">
        {/* Role Label - Editorial Style */}
        <div className="mb-3">
          <span className={`
            text-xs font-bold uppercase tracking-wider
            ${isUser ? "text-gray-400" : "text-black"}
          `}>
            {roleLabel}
          </span>
        </div>

        {/* Content Area */}
        <div className="text-base leading-relaxed text-gray-900 font-body">
          {isForm && formPayload ? (
            <div className="space-y-6 border-l border-gray-200 pl-4 my-2">
              <div className="text-sm font-semibold text-gray-500 italic font-heading">
                Submitted Requirements
              </div>
              {formPayload.questions.map((question, index) => {
                const key = question.id ?? `q-${index}`;
                const draft = formPayload.answers[key];
                return (
                  <div key={key}>
                    <p className="text-sm font-bold text-black mb-1 font-heading">
                      {question.text}
                    </p>
                    <p className="text-sm text-gray-600">
                      {formatDraftAnswer(question, draft)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={`
              prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2
              prose-headings:font-heading prose-headings:font-bold prose-headings:text-black
              prose-p:text-gray-900 prose-p:leading-7
              prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 prose-pre:text-gray-800
              prose-code:text-black prose-code:font-mono prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
              prose-strong:font-bold prose-strong:text-black
            `}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

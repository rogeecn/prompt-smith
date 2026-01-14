"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { User, Bot, ClipboardCheck, Info } from "lucide-react";
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
  timestamp,
  isForm,
  formPayload,
}: MessageBlockProps) {
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isSystem = role === "system";

  return (
    <div 
      className={`
        w-full transition-colors duration-200
        ${isUser ? "bg-block-user" : isAssistant ? "bg-block-ai" : "bg-block-system"}
      `}
    >
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex gap-4 sm:gap-6">
          {/* Avatar Area */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <div 
              className={`
                flex h-8 w-8 items-center justify-center rounded-lg shadow-sm
                ${isUser ? "bg-white text-slate-600" : isAssistant ? "bg-indigo-600 text-white" : "bg-blue-100 text-blue-600"}
              `}
            >
              {isUser ? <User className="h-4 w-4" /> : isAssistant ? <Bot className="h-4 w-4" /> : <Info className="h-4 w-4" />}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {isUser ? "用户指令" : isAssistant ? "AI 助手" : "系统过程"}
              </span>
              {timestamp && (
                <span className="text-[10px] text-slate-400">
                  {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {isForm && formPayload ? (
              <div className="mt-4 space-y-6">
                <div className="flex items-center gap-2 text-indigo-600 mb-4">
                  <ClipboardCheck className="h-4 w-4" />
                  <span className="text-sm font-semibold">需求调研表单已提交</span>
                </div>
                {formPayload.questions.map((question, index) => {
                  const key = question.id ?? `q-${index}`;
                  const draft = formPayload.answers[key];
                  return (
                    <div key={key} className="relative pl-4 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-slate-200">
                      <p className="text-sm font-bold text-slate-900 mb-1">
                        Q{index + 1}: {question.text}
                      </p>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        A: {formatDraftAnswer(question, draft)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`
                prose prose-sm max-w-none leading-relaxed break-words
                ${isUser ? "text-slate-700" : "text-slate-800"}
                [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:my-4
                [&_code]:bg-slate-100 [&_code]:text-indigo-600 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-medium
                [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6
                [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-4 [&_blockquote]:italic
              `}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

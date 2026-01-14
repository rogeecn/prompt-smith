"use client";

import React, { useMemo } from "react";
import { ClipboardList, CheckCircle2, AlertCircle } from "lucide-react";
import type { Question, DraftAnswer } from "../../lib/schemas";

type QuestionFormProps = {
  questions: Question[];
  draftAnswers: Record<string, DraftAnswer>;
  fieldErrors: Record<string, string>;
  isLoading: boolean;
  isDisabled: boolean;
  saveStatusLabel: string;
  formError: string | null;
  onTextChange: (key: string, value: string) => void;
  onSingleSelect: (key: string, value: string) => void;
  onMultiToggle: (key: string, value: string, maxSelect?: number) => void;
  onOtherChange: (key: string, value: string) => void;
  onSelectAll: (key: string, options: Question["options"]) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onRetry?: () => void;
};

const OTHER_OPTION_ID = "__other__";
const NONE_OPTION_ID = "__none__";

const getQuestionKey = (question: Question, index: number) =>
  question.id ?? `q-${index}`;

const normalizeOptions = (
  question: Question,
  allowOther: boolean,
  allowNone: boolean
) => {
  const baseOptions = question.options ?? [];
  const seen = new Set<string>();

  const isOtherLabel = (label: string) =>
    label.trim() === "其他" || label.trim().startsWith("其他");
  const isNoneLabel = (label: string) =>
    label.trim() === "不需要此功能" || label.trim().startsWith("不需要");

  const normalized = baseOptions
    .map((option) => {
      if (allowOther && isOtherLabel(option.label)) {
        return { ...option, id: OTHER_OPTION_ID };
      }
      if (allowNone && isNoneLabel(option.label)) {
        return { ...option, id: NONE_OPTION_ID };
      }
      return option;
    })
    .filter((option) => {
      if (seen.has(option.id)) return false;
      seen.add(option.id);
      return true;
    });

  if (allowOther && !normalized.some((o) => o.id === OTHER_OPTION_ID)) {
    normalized.push({ id: OTHER_OPTION_ID, label: "其他（自填）" });
  }
  if (allowNone && !normalized.some((o) => o.id === NONE_OPTION_ID)) {
    normalized.push({ id: NONE_OPTION_ID, label: "不需要此功能" });
  }
  return normalized;
};

export default function QuestionForm({
  questions,
  draftAnswers,
  fieldErrors,
  isLoading,
  isDisabled,
  saveStatusLabel,
  formError,
  onTextChange,
  onSingleSelect,
  onMultiToggle,
  onOtherChange,
  onSelectAll,
  onSubmit,
  onRetry,
}: QuestionFormProps) {
  const answeredCount = useMemo(() => {
    return questions.reduce((count, question, index) => {
      const key = getQuestionKey(question, index);
      const draft = draftAnswers[key];
      if (!draft) return count;
      if (question.type === "text") {
        return typeof draft.value === "string" && draft.value.trim() ? count + 1 : count;
      }
      if (question.type === "single") {
        if (!draft.value) return count;
        if (draft.value === OTHER_OPTION_ID && !draft.other?.trim()) return count;
        return count + 1;
      }
      if (question.type === "multi") {
        if (!Array.isArray(draft.value) || draft.value.length === 0) return count;
        if (draft.value.includes(OTHER_OPTION_ID) && !draft.other?.trim()) return count;
        return count + 1;
      }
      return count;
    }, 0);
  }, [questions, draftAnswers]);

  return (
    <div className="w-full bg-block-system border-y border-blue-100/50">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <form onSubmit={onSubmit} className="rounded-3xl bg-white p-6 shadow-xl shadow-blue-900/5 sm:p-8">
          <div className="flex items-center justify-between border-b border-slate-100 pb-6 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">需求调研问卷</h3>
                <p className="text-xs text-slate-500 mt-0.5">请补充以下信息以生成更精准的 Prompt</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-indigo-600">
                {answeredCount} / {questions.length}
              </div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1 font-bold">完成进度</p>
            </div>
          </div>

          <div className="space-y-10">
            {questions.map((question, index) => {
              const key = getQuestionKey(question, index);
              const draft = draftAnswers[key];
              const allowOther = question.allow_other ?? question.type !== "text";
              const allowNone = question.allow_none ?? question.type !== "text";
              const options = normalizeOptions(question, allowOther, allowNone);
              const error = fieldErrors[key];

              return (
                <div key={key} className="group transition-all">
                  <div className="flex items-start gap-4 mb-4">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 group-focus-within:bg-indigo-600 group-focus-within:text-white transition-colors">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      {question.step && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 block mb-1">
                          {question.step}
                        </span>
                      )}
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">
                        {question.text}
                      </h4>
                    </div>
                  </div>

                  <div className="ml-10">
                    {question.type === "text" ? (
                      <div className="relative">
                        <input
                          value={typeof draft?.value === "string" ? draft.value : ""}
                          onChange={(e) => onTextChange(key, e.target.value)}
                          placeholder={question.placeholder ?? "输入你的回答..."}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm transition-all focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none"
                          disabled={isLoading || isDisabled}
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {question.type === "multi" && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                              {question.max_select ? `最多可选 ${question.max_select} 项` : "多选题"}
                            </span>
                            <button
                              type="button"
                              onClick={() => onSelectAll(key, options)}
                              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors uppercase tracking-tight"
                            >
                              全选
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {options.map((option) => {
                            const isSelected = question.type === "single" 
                              ? draft?.value === option.id 
                              : Array.isArray(draft?.value) && draft.value.includes(option.id);
                            
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => question.type === "single" ? onSingleSelect(key, option.id) : onMultiToggle(key, option.id, question.max_select)}
                                className={`
                                  flex items-center gap-3 rounded-xl px-4 py-3 text-left text-xs font-medium transition-all
                                  ${isSelected 
                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 translate-y-[-1px]" 
                                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                                  }
                                `}
                                disabled={isLoading || isDisabled}
                              >
                                <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-white bg-white/20" : "border-slate-300 bg-white"}`}>
                                  {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                                </div>
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* "Other" input field */}
                    {(draft?.value === OTHER_OPTION_ID || (Array.isArray(draft?.value) && draft.value.includes(OTHER_OPTION_ID))) && (
                      <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                        <input
                          value={draft?.other ?? ""}
                          onChange={(e) => onOtherChange(key, e.target.value)}
                          placeholder="请详细说明..."
                          className="w-full rounded-xl border border-indigo-200 bg-indigo-50/30 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all"
                          autoFocus
                        />
                      </div>
                    )}

                    {error && (
                      <div className="mt-3 flex items-center gap-1.5 text-rose-500">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-bold">{error}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-6 border-t border-slate-100 pt-8 sm:flex-row">
            <div className="flex items-center gap-2">
              {saveStatusLabel && (
                <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">
                  <div className={`h-1.5 w-1.5 rounded-full ${saveStatusLabel.includes("失败") ? "bg-rose-500" : "bg-emerald-500 animate-pulse"}`} />
                  {saveStatusLabel}
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-4 sm:flex-row">
              {formError && (
                <div className="flex items-center gap-2 text-rose-500">
                  <span className="text-xs font-bold">{formError}</span>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100 transition-colors"
                    >
                      重试
                    </button>
                  )}
                </div>
              )}
              <button
                type="submit"
                disabled={isLoading || isDisabled}
                className="group relative flex items-center gap-2 rounded-2xl bg-indigo-600 px-8 py-4 text-sm font-bold text-white shadow-xl shadow-indigo-200 transition-all hover:bg-indigo-700 hover:translate-y-[-2px] active:translate-y-0 disabled:opacity-50 disabled:translate-y-0"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>确认提交回答</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

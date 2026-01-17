"use client";

import { useEffect, useState } from "react";
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
  onMultiToggle: (key: string, value: string, max?: number) => void;
  onOtherChange: (key: string, value: string) => void;
  onSelectAll: (key: string, options: { id: string; label: string }[]) => void;
  onSubmit: (e: React.FormEvent) => void;
  onRetry?: () => void;
};

const getQuestionKey = (question: Question, index: number) =>
  question.id ?? `q-${index}`;

export default function QuestionForm({
  questions,
  draftAnswers,
  isLoading,
  isDisabled,
  formError,
  onTextChange,
  onSingleSelect,
  onMultiToggle,
  onOtherChange,
  onSubmit,
}: QuestionFormProps) {
  const [visibleCount, setVisibleCount] = useState(questions.length);

  useEffect(() => {
    setVisibleCount(questions.length);
  }, [questions.length]);

  if (questions.length === 0) return null;

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mx-auto max-w-3xl px-6 py-8 border-t border-gray-100">
        <p className="text-sm text-gray-500 mb-8 font-body italic">
          Please answer the following to refine the prompt:
        </p>

        <form onSubmit={onSubmit} className="space-y-10">
          {questions.slice(0, visibleCount).map((q, i) => {
            const key = getQuestionKey(q, i);
            const fieldId = `question-${key}`;
            const draft = draftAnswers[key];
            const otherValue = draft?.other ?? "";
            const isOtherSelected =
              draft?.value === "__other__" ||
              (Array.isArray(draft?.value) && draft.value.includes("__other__"));

            return (
              <div key={key} className="group">
                <label className="block text-lg text-black mb-4 font-heading font-medium">
                  {q.text}
                </label>

                {/* Text Input */}
                {q.type === "text" && (
                  <div className="relative">
                    <input
                      type="text"
                      id={fieldId}
                      name={fieldId}
                      value={typeof draft?.value === "string" ? draft.value : ""}
                      onChange={(e) => onTextChange(key, e.target.value)}
                      placeholder={q.placeholder || "Type your answer..."}
                      disabled={isDisabled || isLoading}
                      className="
                        w-full border-b border-gray-300 
                        bg-transparent py-2 text-base text-black 
                        placeholder:text-gray-400
                        focus:border-accent focus:outline-none transition-colors duration-300
                      "
                    />
                  </div>
                )}

                {/* Single Select */}
                {q.type === "single" && (
                  <div className="space-y-3">
                    {q.options?.map((opt) => (
                      <label
                        key={opt.id} 
                        className="flex items-start gap-3 cursor-pointer group/opt"
                      >
                        <div className="relative flex items-center mt-1">
                          <input
                            type="radio"
                            id={`${fieldId}-${opt.id}`}
                            name={key}
                            value={opt.id}
                            checked={draft?.value === opt.id}
                            onChange={() => onSingleSelect(key, opt.id)}
                            disabled={isDisabled || isLoading}
                            className="peer sr-only"
                          />
                          <div className="
                            h-4 w-4 border border-gray-300 rounded-none bg-white
                            peer-checked:bg-black peer-checked:border-black
                            transition-all duration-200
                          " />
                        </div>
                        <span className={`
                          text-sm text-gray-600 group-hover/opt:text-black transition-colors
                          ${draft?.value === opt.id ? "text-black font-medium" : ""}
                        `}>
                          {opt.label}
                        </span>
                      </label>
                    ))}
                    {/* Other Input for Single Select */}
                    {isOtherSelected && (
                      <input
                        type="text"
                        id={`${fieldId}-other`}
                        name={`${fieldId}-other`}
                        value={otherValue}
                        onChange={(e) => onOtherChange(key, e.target.value)}
                        placeholder="Please specify..."
                        className="
                          ml-7 mt-2 w-2/3 border-b border-gray-200 
                          bg-transparent py-1 text-sm text-black
                          focus:border-accent focus:outline-none animate-in fade-in
                        "
                        autoFocus
                      />
                    )}
                  </div>
                )}

                {/* Multi Select */}
                {q.type === "multi" && (
                  <div className="space-y-3">
                    {q.options?.map((opt) => {
                      const isChecked = Array.isArray(draft?.value) && draft.value.includes(opt.id);
                      return (
                        <label
                          key={opt.id} 
                          className="flex items-start gap-3 cursor-pointer group/opt"
                        >
                          <div className="relative flex items-center mt-1">
                            <input
                              type="checkbox"
                              id={`${fieldId}-${opt.id}`}
                              name={`${key}[]`}
                              checked={isChecked}
                              onChange={() => onMultiToggle(key, opt.id, q.max_select)}
                              disabled={isDisabled || isLoading}
                              className="peer sr-only"
                            />
                             <div className="
                              h-4 w-4 border border-gray-300 rounded-none bg-white
                              peer-checked:bg-black peer-checked:border-black
                              transition-all duration-200
                              flex items-center justify-center
                            ">
                              {isChecked && <div className="h-2 w-2 bg-white" />}
                            </div>
                          </div>
                          <span className={`
                            text-sm text-gray-600 group-hover/opt:text-black transition-colors
                            ${isChecked ? "text-black font-medium" : ""}
                          `}>
                            {opt.label}
                          </span>
                        </label>
                      );
                    })}
                     {/* Other Input for Multi Select */}
                     {isOtherSelected && (
                      <input
                        type="text"
                        id={`${fieldId}-other`}
                        name={`${fieldId}-other`}
                        value={otherValue}
                        onChange={(e) => onOtherChange(key, e.target.value)}
                        placeholder="Please specify..."
                        className="
                          ml-7 mt-2 w-2/3 border-b border-gray-200 
                          bg-transparent py-1 text-sm text-black
                          focus:border-accent focus:outline-none animate-in fade-in
                        "
                        autoFocus
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-8">
            {formError && (
              <div className="mb-3 text-sm font-medium text-rose-500">
                {formError}
              </div>
            )}
            <button
              type="submit"
              disabled={isDisabled || isLoading}
              className="
                w-full sm:w-auto min-w-[200px]
                bg-black text-white 
                px-8 py-3 text-sm font-semibold tracking-wide
                hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400
                transition-all duration-200
              "
            >
              {isLoading ? "Processing..." : "Submit & Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

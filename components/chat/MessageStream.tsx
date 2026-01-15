"use client";

import { useEffect, useState } from "react";
import MessageBlock from "./MessageBlock";
import AgentDeliberation from "./AgentDeliberation";
import { Activity } from "lucide-react";
import type { HistoryItem, LLMResponse, Question, DraftAnswer } from "../../lib/schemas";

type MessageStreamProps = {
  messages: HistoryItem[];
  deliberations: LLMResponse["deliberations"];
  isLoading: boolean;
  parseFormMessage: (content: string) => {
    questions: Question[];
    answers: Record<string, DraftAnswer>;
  } | null;
};

export default function MessageStream({
  messages,
  deliberations,
  isLoading,
  parseFormMessage,
}: MessageStreamProps) {
  const [visibleDeliberations, setVisibleDeliberations] = useState<
    LLMResponse["deliberations"]
  >([]);

  useEffect(() => {
    if (!deliberations || deliberations.length === 0) {
      setVisibleDeliberations([]);
      return;
    }

    let index = 0;
    setVisibleDeliberations([]);
    const timer = setInterval(() => {
      index += 1;
      setVisibleDeliberations(deliberations.slice(0, index));
      if (index >= deliberations.length) {
        clearInterval(timer);
      }
    }, 450);

    return () => {
      clearInterval(timer);
    };
  }, [deliberations]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-500">
          <Activity className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">开启你的 Prompt 向导</h3>
        <p className="mt-2 max-w-xs text-sm text-slate-500 leading-relaxed">
          描述你的需求，AI 将通过多轮对话引导你构建完美的提示词模板。
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <div className="flex flex-col">
        {messages.map((item, index) => {
          const formPayload = parseFormMessage(item.content);
          return (
            <MessageBlock
              key={`${item.timestamp}-${index}`}
              role={item.role as any}
              content={item.content}
              timestamp={item.timestamp}
              isForm={!!formPayload}
              formPayload={formPayload}
            />
          );
        })}
        <AgentDeliberation deliberations={visibleDeliberations} />

        {/* AI Loading Block */}
        {isLoading && (
          <div className="w-full bg-block-ai">
            <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="flex gap-6 animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-slate-200" />
                <div className="flex-1 space-y-3 pt-1">
                  <div className="h-3 w-24 rounded bg-slate-200" />
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-slate-100" />
                    <div className="h-4 w-3/4 rounded bg-slate-100" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

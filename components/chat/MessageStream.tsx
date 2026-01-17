"use client";

import MessageBlock from "./MessageBlock";
import AgentDeliberation from "./AgentDeliberation";
import { Activity } from "lucide-react";
import type { HistoryItem, Question, DraftAnswer, LLMResponse } from "../../lib/schemas";

type MessageStreamProps = {
  messages: HistoryItem[];
  isLoading: boolean;
  loadingStage?: string | null;
  parseFormMessage: (content: string) => {
    questions: Question[];
    answers: Record<string, DraftAnswer>;
  } | null;
};

const DELIBERATION_MESSAGE_PREFIX = "__DELIBERATIONS__:";

const parseDeliberationMessage = (content: string) => {
  if (!content.startsWith(DELIBERATION_MESSAGE_PREFIX)) return null;
  const raw = content.slice(DELIBERATION_MESSAGE_PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as LLMResponse["deliberations"];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export default function MessageStream({
  messages,
  isLoading,
  loadingStage,
  parseFormMessage,
}: MessageStreamProps) {
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
          const deliberation = parseDeliberationMessage(item.content);
          if (deliberation) {
            return (
              <AgentDeliberation
                key={`${item.timestamp}-${index}`}
                deliberations={deliberation}
              />
            );
          }
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

        {/* AI Loading Block */}
        {isLoading && (
          <div className="w-full bg-transparent">
            <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="flex gap-6 animate-pulse">
                <div className="h-8 w-8 bg-slate-200" />
                <div className="flex-1 space-y-3 pt-1">
                  <div className="text-xs font-medium text-slate-500">
                    {loadingStage ?? "AI 正在思考..."}
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-full bg-slate-100" />
                    <div className="h-4 w-3/4 bg-slate-100" />
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

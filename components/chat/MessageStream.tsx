"use client";

import React, { useRef, useEffect } from "react";
import MessageBlock from "./MessageBlock";
import { ChevronDown, ChevronUp, Activity } from "lucide-react";
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
  const [isDeliberationOpen, setIsDeliberationOpen] = React.useState(false);
  
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
    <div className="flex-1 overflow-y-auto">
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

        {/* Deliberations 区块 */}
        {deliberations && deliberations.length > 0 && (
          <div className="w-full bg-block-system border-y border-blue-100/50">
            <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
              <div className="rounded-2xl bg-white/60 p-1 ring-1 ring-blue-100">
                <button
                  onClick={() => setIsDeliberationOpen(!isDeliberationOpen)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm font-bold text-slate-700">多 Agent 协作评分与思考过程</span>
                  </div>
                  {isDeliberationOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>
                
                {isDeliberationOpen && (
                  <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-6 pt-4 border-t border-blue-50">
                      {deliberations.map((stage, sIdx) => (
                        <div key={sIdx} className="space-y-3">
                          <h5 className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                            Stage: {stage.stage}
                          </h5>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {stage.agents.map((agent, aIdx) => (
                              <div key={aIdx} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-xs font-bold text-slate-900">{agent.name}</span>
                                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
                                    Score: {agent.score}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 italic leading-snug mb-2">"{agent.stance}"</p>
                                <p className="text-[11px] text-slate-600 leading-relaxed">{agent.rationale}</p>
                              </div>
                            ))}
                          </div>
                          <div className="rounded-xl bg-blue-50/50 p-3 text-xs text-blue-800 leading-relaxed border border-blue-100">
                            <span className="font-bold">阶段性总结：</span> {stage.synthesis}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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

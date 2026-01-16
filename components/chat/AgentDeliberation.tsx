"use client";

import { useState } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import type { LLMResponse } from "../../lib/schemas";

type AgentDeliberationProps = {
  deliberations: LLMResponse["deliberations"];
};

export default function AgentDeliberation({
  deliberations,
}: AgentDeliberationProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!deliberations || deliberations.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-block-system border-y border-slate-200">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="border border-slate-200 bg-white">
          <button
            onClick={() => setIsOpen((prev) => !prev)}
            className={`flex w-full items-center justify-between px-4 py-3 text-left ${isOpen ? "border-b border-slate-200" : ""}`}
          >
            <div className="flex items-center gap-3">
              <Activity className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-bold text-slate-700">
                多 Agent 协作评分与思考过程
              </span>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {isOpen ? (
            <div className="animate-in fade-in slide-in-from-top-2 px-4 pb-4">
              <div className="space-y-6 pt-4">
                {deliberations.map((stage, stageIndex) => (
                  <div key={stageIndex} className="space-y-3">
                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                      Stage: {stage.stage}
                    </h5>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {stage.agents.map((agent, agentIndex) => (
                        <div
                          key={agentIndex}
                          className="border border-slate-200 bg-white p-3"
                        >
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">
                              {agent.name}
                            </span>
                            <span className="border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-indigo-600">
                              Score: {agent.score}
                            </span>
                          </div>
                          <p className="mb-2 text-[11px] italic leading-snug text-slate-500">
                            &quot;{agent.stance}&quot;
                          </p>
                          <p className="text-[11px] leading-relaxed text-slate-600">
                            {agent.rationale}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-blue-800">
                      <span className="font-bold">阶段性总结：</span>{" "}
                      {stage.synthesis}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

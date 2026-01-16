"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  LLMResponseSchema,
  type Answer,
  type DraftAnswer,
  type HistoryItem,
  type LLMResponse,
  type OutputFormat,
  type SessionState,
  type Question,
} from "../lib/schemas";
import {
  updateSessionState,
  updateSessionModelConfig,
} from "../src/app/actions";
import { deriveTitleFromPrompt } from "../lib/template";

export type SendRequestPayload = {
  message?: string;
  answers?: Answer[];
  optimisticUserMessage?: HistoryItem;
  appendUserMessage?: boolean;
};

const STAGE_LABELS: Record<string, string> = {
  start: "已接收请求",
  load_session: "加载会话中...",
  llm: "调用模型生成中...",
  llm_retry: "补充生成中...",
  alchemy: "整合生成结果中...",
  guard: "安全审查与修复中...",
  persist: "保存对话中...",
};

type UseChatSessionOptions = {
  projectId: string;
  sessionId: string;
  initialMessages?: HistoryItem[];
  initialState?: SessionState;
  isDisabled?: boolean;
  onSessionTitleUpdate?: (title: string) => void;
  defaultModelId?: string | null;
  defaultOutputFormat?: OutputFormat | null;
};

type UseChatSessionResult = {
  messages: HistoryItem[];
  pendingQuestions: Question[];
  draftAnswers: Record<string, DraftAnswer>;
  setDraftAnswers: Dispatch<SetStateAction<Record<string, DraftAnswer>>>;
  setPendingQuestions: Dispatch<SetStateAction<Question[]>>;
  isLoading: boolean;
  formError: string | null;
  retryPayload: Pick<SendRequestPayload, "message" | "answers"> | null;
  finalPrompt: string | null;
  isFinished: boolean;
  deliberations: LLMResponse["deliberations"];
  saveStatus: "idle" | "saving" | "saved" | "error";
  modelId: string | null;
  setModelId: Dispatch<SetStateAction<string | null>>;
  outputFormat: OutputFormat | null;
  setOutputFormat: Dispatch<SetStateAction<OutputFormat | null>>;
  loadingStage: string | null;
  sendRequest: (payload: SendRequestPayload) => Promise<void>;
};

export const useChatSession = ({
  projectId,
  sessionId,
  initialMessages = [],
  initialState,
  isDisabled = false,
  onSessionTitleUpdate,
  defaultModelId = null,
  defaultOutputFormat = null,
}: UseChatSessionOptions): UseChatSessionResult => {
  const [messages, setMessages] = useState<HistoryItem[]>(initialMessages);
  const [pendingQuestions, setPendingQuestions] = useState<Question[]>(
    initialState?.questions ?? []
  );
  const [draftAnswers, setDraftAnswers] = useState<Record<string, DraftAnswer>>(
    (initialState?.draft_answers as Record<string, DraftAnswer>) ?? {}
  );
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [retryPayload, setRetryPayload] = useState<
    Pick<SendRequestPayload, "message" | "answers"> | null
  >(null);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(
    initialState?.final_prompt ?? null
  );
  const [isFinished, setIsFinished] = useState(
    initialState?.is_finished ?? false
  );
  const [deliberations, setDeliberations] = useState<
    LLMResponse["deliberations"]
  >(initialState?.deliberations ?? []);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modelId, setModelId] = useState<string | null>(
    initialState?.model_id ??
      initialState?.target_model ??
      defaultModelId ??
      null
  );
  const [outputFormat, setOutputFormat] = useState<OutputFormat | null>(
    initialState?.output_format ?? defaultOutputFormat ?? null
  );
  const modelConfigSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelConfigInitRef = useRef(false);

  useEffect(() => {
    setMessages(initialMessages);
    setPendingQuestions(initialState?.questions ?? []);
    setDraftAnswers(
      (initialState?.draft_answers as Record<string, DraftAnswer>) ?? {}
    );
    setFinalPrompt(initialState?.final_prompt ?? null);
    setIsFinished(initialState?.is_finished ?? false);
    setDeliberations(initialState?.deliberations ?? []);
    setModelId(
      initialState?.model_id ??
        initialState?.target_model ??
        defaultModelId ??
        null
    );
    setOutputFormat(initialState?.output_format ?? defaultOutputFormat ?? null);
    setFormError(null);
    setRetryPayload(null);
    setIsLoading(false);
    setLoadingStage(null);
    modelConfigInitRef.current = false;
  }, [projectId, sessionId, initialMessages, initialState]);

  useEffect(() => {
    if (!modelId && defaultModelId) {
      setModelId(defaultModelId);
    }
  }, [defaultModelId, modelId]);

  useEffect(() => {
    if (!outputFormat && defaultOutputFormat) {
      setOutputFormat(defaultOutputFormat);
    }
  }, [defaultOutputFormat, outputFormat]);

  useEffect(() => {
    if (!projectId || !sessionId || pendingQuestions.length === 0) {
      return;
    }

    const state: SessionState = {
      questions: pendingQuestions,
      deliberations,
      final_prompt: finalPrompt,
      is_finished: isFinished,
      target_model: modelId,
      model_id: modelId,
      output_format: outputFormat,
      draft_answers: draftAnswers,
      title: finalPrompt
        ? deriveTitleFromPrompt(finalPrompt)
        : (initialState?.title ?? null),
    };

    setSaveStatus("saving");
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      void updateSessionState(projectId, sessionId, state)
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("error"));
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    projectId,
    sessionId,
    pendingQuestions,
    draftAnswers,
    deliberations,
    finalPrompt,
    isFinished,
    modelId,
    outputFormat,
    initialState?.title,
  ]);

  useEffect(() => {
    if (!projectId || !sessionId) {
      return;
    }
    if (!modelConfigInitRef.current) {
      modelConfigInitRef.current = true;
      return;
    }

    if (modelConfigSaveRef.current) {
      clearTimeout(modelConfigSaveRef.current);
    }

    modelConfigSaveRef.current = setTimeout(() => {
      void updateSessionModelConfig(
        projectId,
        sessionId,
        modelId,
        outputFormat
      ).catch(() => null);
    }, 500);

    return () => {
      if (modelConfigSaveRef.current) {
        clearTimeout(modelConfigSaveRef.current);
      }
    };
  }, [projectId, sessionId, modelId, outputFormat]);

  const sendRequest = async ({
    message,
    answers,
    optimisticUserMessage,
    appendUserMessage = true,
  }: SendRequestPayload) => {
    if (isLoading || isDisabled) {
      return;
    }

    if (appendUserMessage && optimisticUserMessage) {
      setMessages((prev) => [...prev, optimisticUserMessage]);
    }
    setIsLoading(true);
    setFormError(null);
    setDeliberations([]);
    setLoadingStage("正在准备请求...");

    const applyResponse = (payload: LLMResponse) => {
      if (payload.final_prompt) {
        setFinalPrompt(payload.final_prompt);
      }
      setIsFinished(payload.is_finished);
      setDeliberations(payload.deliberations ?? []);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: payload.reply, timestamp: Date.now() },
      ]);
      setPendingQuestions(payload.questions ?? []);
      setDraftAnswers({});
      setRetryPayload(null);
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          projectId,
          sessionId,
          message,
          answers,
          modelId: modelId?.trim() ? modelId.trim() : undefined,
          outputFormat: outputFormat ?? undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let receivedResult = false;

        const parseEventBlock = (chunk: string) => {
          const lines = chunk.split("\n");
          let eventName = "message";
          let data = "";
          lines.forEach((line) => {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              data += line.slice(5).trim();
            }
          });
          return { eventName, data };
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let delimiterIndex = buffer.indexOf("\n\n");
          while (delimiterIndex !== -1) {
            const chunk = buffer.slice(0, delimiterIndex).trim();
            buffer = buffer.slice(delimiterIndex + 2);
            delimiterIndex = buffer.indexOf("\n\n");
            if (!chunk) continue;
            const { eventName, data } = parseEventBlock(chunk);
            if (!data) continue;
            if (eventName === "stage") {
              try {
                const payload = JSON.parse(data) as { stage?: string };
                const stage = payload.stage?.trim() ?? "";
                if (stage) {
                  setLoadingStage(STAGE_LABELS[stage] ?? stage);
                }
              } catch {
                setLoadingStage("AI 正在处理...");
              }
              continue;
            }
            if (eventName === "result") {
              const payload = LLMResponseSchema.parse(JSON.parse(data));
              applyResponse(payload);
              receivedResult = true;
              break;
            }
            if (eventName === "error") {
              const payload = JSON.parse(data) as { message?: string };
              throw new Error(payload.message || "请求失败");
            }
          }
          if (receivedResult) {
            break;
          }
        }
        if (!receivedResult) {
          throw new Error("请求失败");
        }
      } else {
        const payload = LLMResponseSchema.parse(await response.json());
        applyResponse(payload);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "请求失败");
      setRetryPayload({ message, answers });
    } finally {
      setIsLoading(false);
      setLoadingStage(null);
    }
  };

  return {
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
    modelId,
    setModelId,
    outputFormat,
    setOutputFormat,
    loadingStage,
    sendRequest,
  };
};

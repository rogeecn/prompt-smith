"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  LLMResponseSchema,
  type Answer,
  type DraftAnswer,
  type HistoryItem,
  type LLMResponse,
  type SessionState,
  type Question,
} from "../lib/schemas";
import { updateSessionState } from "../src/app/actions";

export type SendRequestPayload = {
  message?: string;
  answers?: Answer[];
  optimisticUserMessage?: HistoryItem;
  appendUserMessage?: boolean;
};

type UseChatSessionOptions = {
  projectId: string;
  sessionId: string;
  initialMessages?: HistoryItem[];
  initialState?: SessionState;
  isDisabled?: boolean;
  onSessionTitleUpdate?: (title: string) => void;
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
  sendRequest: (payload: SendRequestPayload) => Promise<void>;
};

export const useChatSession = ({
  projectId,
  sessionId,
  initialMessages = [],
  initialState,
  isDisabled = false,
  onSessionTitleUpdate,
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
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetModelRef = useRef<string | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
    setPendingQuestions(initialState?.questions ?? []);
    setDraftAnswers(
      (initialState?.draft_answers as Record<string, DraftAnswer>) ?? {}
    );
    setFinalPrompt(initialState?.final_prompt ?? null);
    setIsFinished(initialState?.is_finished ?? false);
    setDeliberations(initialState?.deliberations ?? []);
    setFormError(null);
    setRetryPayload(null);
    setIsLoading(false);
  }, [projectId, sessionId, initialMessages, initialState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    targetModelRef.current = params.get("targetModel");
  }, [projectId, sessionId]);

  useEffect(() => {
    if (!projectId || !sessionId || pendingQuestions.length === 0) {
      return;
    }

    const state: SessionState = {
      questions: pendingQuestions,
      deliberations,
      final_prompt: finalPrompt,
      is_finished: isFinished,
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
    initialState?.title,
  ]);

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

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sessionId,
          message,
          answers,
          targetModel: targetModelRef.current ?? undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }
      const payload = LLMResponseSchema.parse(await response.json());

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
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "请求失败");
      setRetryPayload({ message, answers });
    } finally {
      setIsLoading(false);
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
    sendRequest,
  };
};

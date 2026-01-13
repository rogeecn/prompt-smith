"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChatRequestSchema,
  LLMResponseSchema,
  type Answer,
  type DraftAnswer,
  type LLMResponse,
  type HistoryItem,
  type Question,
  type SessionState,
} from "../lib/schemas";
import { createArtifactFromPrompt, updateSessionState } from "../src/app/actions";
import { deriveTitleFromPrompt } from "../lib/template";

const OTHER_OPTION_ID = "__other__";
const NONE_OPTION_ID = "__none__";
const DEFAULT_START_MESSAGE = "开始向导";
const FORM_MESSAGE_PREFIX = "__FORM__:";
const isDebug = process.env.NODE_ENV !== "production";

const logDebug = (label: string, payload?: unknown) => {
  if (!isDebug) {
    return;
  }
  if (payload === undefined) {
    console.log(`[ChatInterface] ${label}`);
    return;
  }
  console.log(`[ChatInterface] ${label}`, payload);
};

type ChatInterfaceProps = {
  projectId: string;
  sessionId: string;
  initialMessages?: HistoryItem[];
  initialState?: SessionState;
  isDisabled?: boolean;
  onSessionTitleUpdate?: (title: string) => void;
};

const getQuestionKey = (question: Question, index: number) =>
  question.id ?? `q-${index}`;

const getOptionLabel = (question: Question, optionId: string) => {
  if (optionId === OTHER_OPTION_ID) {
    return "其他";
  }

  if (optionId === NONE_OPTION_ID) {
    return "不需要此功能";
  }

  return question.options?.find((option) => option.id === optionId)?.label ?? optionId;
};

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
      if (seen.has(option.id)) {
        return false;
      }
      seen.add(option.id);
      return true;
    });

  if (allowOther && !normalized.some((option) => option.id === OTHER_OPTION_ID)) {
    normalized.push({ id: OTHER_OPTION_ID, label: "其他（自填）" });
  }

  if (allowNone && !normalized.some((option) => option.id === NONE_OPTION_ID)) {
    normalized.push({ id: NONE_OPTION_ID, label: "不需要此功能" });
  }

  return normalized;
};

const serializeFormMessage = (payload: {
  questions: Question[];
  answers: Record<string, DraftAnswer>;
}) => `${FORM_MESSAGE_PREFIX}${JSON.stringify(payload)}`;

const parseFormMessage = (content: string) => {
  if (!content.startsWith(FORM_MESSAGE_PREFIX)) {
    return null;
  }
  const raw = content.slice(FORM_MESSAGE_PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as {
      questions: Question[];
      answers: Record<string, DraftAnswer>;
    };
    if (!parsed || !Array.isArray(parsed.questions)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const formatDraftAnswer = (question: Question, draft?: DraftAnswer) => {
  if (!draft) {
    return "未填写";
  }

  if (question.type === "text") {
    if (typeof draft.value === "string" && draft.value.trim()) {
      return draft.value.trim();
    }
    return "未填写";
  }

  if (question.type === "single") {
    if (typeof draft.value !== "string" || !draft.value) {
      return "未填写";
    }
    if (draft.value === OTHER_OPTION_ID) {
      return draft.other?.trim() ? `其他：${draft.other.trim()}` : "其他";
    }
    if (draft.value === NONE_OPTION_ID) {
      return "不需要此功能";
    }
    return getOptionLabel(question, draft.value);
  }

  if (question.type === "multi") {
    if (!Array.isArray(draft.value) || draft.value.length === 0) {
      return "未填写";
    }
    if (draft.value.includes(NONE_OPTION_ID)) {
      return "不需要此功能";
    }
    const labels = draft.value.map((value) => {
      if (value === OTHER_OPTION_ID) {
        return draft.other?.trim() ? `其他：${draft.other.trim()}` : "其他";
      }
      return getOptionLabel(question, value);
    });
    return labels.join("、");
  }

  return "未填写";
};

const shouldShowStep = (step?: string) => {
  if (!step) {
    return false;
  }
  return /[^\d\s/.-]/.test(step);
};

export default function ChatInterface({
  projectId,
  sessionId,
  initialMessages = [],
  initialState,
  isDisabled = false,
  onSessionTitleUpdate,
}: ChatInterfaceProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<HistoryItem[]>(initialMessages);
  const [pendingQuestions, setPendingQuestions] = useState<Question[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, DraftAnswer>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [retryPayload, setRetryPayload] = useState<{
    message?: string;
    answers?: Answer[];
  } | null>(null);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [deliberations, setDeliberations] = useState<
    LLMResponse["deliberations"]
  >([]);
  const [exportStatus, setExportStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef<SessionState | null>(null);
  const pendingSaveRef = useRef(false);
  const saveSequenceRef = useRef(0);

  useEffect(() => {
    setMessages(initialMessages);
    setPendingQuestions(initialState?.questions ?? []);
    setDraftAnswers(initialState?.draft_answers ?? {});
    setFieldErrors({});
    setInput("");
    setFormError(null);
    setFinalPrompt(initialState?.final_prompt ?? null);
    setIsFinished(initialState?.is_finished ?? false);
    setCopyState("idle");
    setDeliberations(initialState?.deliberations ?? []);
    setSaveStatus("idle");
    setExportStatus("idle");
    setExportError(null);
  }, [projectId, sessionId, initialMessages, initialState]);

  useEffect(() => {
    if (!finalPrompt) {
      return;
    }
    const title = deriveTitleFromPrompt(finalPrompt);
    onSessionTitleUpdate?.(title);
  }, [finalPrompt, onSessionTitleUpdate]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 160);
    textarea.style.height = `${Math.max(nextHeight, 44)}px`;
  }, [input]);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }

    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, pendingQuestions, isLoading, deliberations, finalPrompt]);

  useEffect(() => {
    if (!projectId || !sessionId) {
      latestStateRef.current = null;
      pendingSaveRef.current = false;
      setSaveStatus("idle");
      return;
    }

    if (pendingQuestions.length === 0) {
      latestStateRef.current = null;
      pendingSaveRef.current = false;
      setSaveStatus("idle");
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      return;
    }

    const state: SessionState = {
      questions: pendingQuestions,
      deliberations,
      final_prompt: finalPrompt,
      is_finished: isFinished,
      draft_answers: draftAnswers,
    };
    latestStateRef.current = state;
    pendingSaveRef.current = true;
    saveSequenceRef.current += 1;
    const currentSequence = saveSequenceRef.current;
    setSaveStatus("saving");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      pendingSaveRef.current = false;
      void updateSessionState(projectId, sessionId, state)
        .then(() => {
          if (saveSequenceRef.current === currentSequence) {
            setSaveStatus("saved");
          }
        })
        .catch((error) => {
          logDebug("保存草稿失败", error);
          if (saveSequenceRef.current === currentSequence) {
            setSaveStatus("error");
          }
        });
    }, 400);

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
  ]);

  useEffect(() => {
    return () => {
      if (!projectId || !sessionId) {
        return;
      }
      const state = latestStateRef.current;
      if (!state || !pendingSaveRef.current) {
        return;
      }
      pendingSaveRef.current = false;
      void updateSessionState(projectId, sessionId, state).catch((error) => {
        logDebug("卸载时保存草稿失败", error);
      });
    };
  }, [projectId, sessionId]);

  const sendRequest = async ({
    message,
    answers,
    optimisticUserMessage,
    appendUserMessage = true,
  }: {
    message?: string;
    answers?: Answer[];
    optimisticUserMessage?: HistoryItem;
    appendUserMessage?: boolean;
  }) => {
    if (isLoading || isDisabled) {
      return;
    }

    if (appendUserMessage && optimisticUserMessage) {
      setMessages((prev) => [...prev, optimisticUserMessage]);
    }
    setIsLoading(true);
    setFormError(null);
    setDeliberations([]);
    setRetryPayload(null);
    const traceId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    logDebug("发送请求", { projectId, message, answers, traceId });

    try {
      const requestBody = ChatRequestSchema.parse({
        projectId,
        sessionId,
        message,
        answers,
        traceId,
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const responseTraceId = response.headers.get("x-trace-id") ?? traceId;
      logDebug("响应 trace", { traceId: responseTraceId, status: response.status });

      if (!response.ok) {
        let errorDetail = "";
        try {
          const errorPayload = (await response.json()) as { error?: string };
          errorDetail = errorPayload?.error ?? "";
        } catch {
          errorDetail = "";
        }
        logDebug("请求失败: 非 2xx", { status: response.status, errorDetail });
        const errorMessage =
          response.status === 504
            ? "请求超时，请重试。"
            : errorDetail || "Request failed";
        throw new Error(errorMessage);
      }

      const payload = LLMResponseSchema.parse(await response.json());
      logDebug("收到响应", payload);

      if (payload.final_prompt && payload.final_prompt.trim().length > 0) {
        setFinalPrompt(payload.final_prompt);
      }

      setIsFinished(payload.is_finished);
      setDeliberations(payload.deliberations ?? []);
      setSaveStatus("idle");

      const assistantMessage: HistoryItem = {
        role: "assistant",
        content: payload.reply,
        timestamp: Date.now(),
      };

      setRetryPayload(null);
      setMessages((prev) => [...prev, assistantMessage]);
      setPendingQuestions(payload.questions ?? []);
      setDraftAnswers({});
      setFieldErrors({});
      setInput("");
    } catch (error) {
      logDebug("请求异常", error);
      const errorMessage: HistoryItem = {
        role: "assistant",
        content:
          error instanceof Error ? error.message : "请求失败，请稍后再试。",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setFormError(
        error instanceof Error ? error.message : "请求失败，请稍后重试。"
      );
      setRetryPayload({ message, answers });
    } finally {
      setIsLoading(false);
    }
  };

  const submitInitialMessage = async (useDefaultMessage: boolean) => {
    if (isLoading || isDisabled) {
      return;
    }

    const trimmed = input.trim();
    const finalMessage = trimmed || (useDefaultMessage ? DEFAULT_START_MESSAGE : "");
    if (!finalMessage) {
      return;
    }

    logDebug("开始引导", { finalMessage });

    const optimisticUserMessage: HistoryItem = {
      role: "user",
      content: finalMessage,
      timestamp: Date.now(),
    };

    await sendRequest({ message: finalMessage, optimisticUserMessage });
  };

  const handleStartSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitInitialMessage(messages.length === 0);
  };

  const updateDraftAnswer = (key: string, next: DraftAnswer) => {
    setDraftAnswers((prev) => {
      const nextDrafts = { ...prev, [key]: next };
      if (projectId && sessionId && pendingQuestions.length > 0) {
        latestStateRef.current = {
          questions: pendingQuestions,
          deliberations,
          final_prompt: finalPrompt,
          is_finished: isFinished,
          draft_answers: nextDrafts,
        };
        pendingSaveRef.current = true;
      }
      return nextDrafts;
    });
    setFieldErrors((prev) => {
      if (!prev[key]) {
        return prev;
      }
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handleSingleSelect = (key: string, value: string) => {
    updateDraftAnswer(key, {
      type: "single",
      value,
      other: value === OTHER_OPTION_ID ? draftAnswers[key]?.other ?? "" : undefined,
    });
  };

  const handleMultiToggle = (
    key: string,
    value: string,
    maxSelect?: number
  ) => {
    const current = draftAnswers[key]?.value;
    const currentValues = Array.isArray(current) ? current : [];

    if (value === NONE_OPTION_ID) {
      updateDraftAnswer(key, { type: "multi", value: [NONE_OPTION_ID] });
      return;
    }

    const isRemoving = currentValues.includes(value);
    const nextValues = isRemoving
      ? currentValues.filter((item) => item !== value)
      : [...currentValues.filter((item) => item !== NONE_OPTION_ID), value];

    if (!isRemoving && maxSelect && nextValues.length > maxSelect) {
      setFieldErrors((prev) => ({
        ...prev,
        [key]: `最多选择 ${maxSelect} 项`,
      }));
      return;
    }

    updateDraftAnswer(key, {
      type: "multi",
      value: nextValues,
      other: nextValues.includes(OTHER_OPTION_ID)
        ? draftAnswers[key]?.other ?? ""
        : undefined,
    });
  };

  const handleOtherChange = (key: string, value: string) => {
    const draft = draftAnswers[key];
    if (!draft) {
      return;
    }

    updateDraftAnswer(key, { ...draft, other: value });
  };

  const handleTextChange = (key: string, value: string) => {
    updateDraftAnswer(key, { type: "text", value });
  };

  const handleSelectAll = (key: string, options: Question["options"]) => {
    if (!options || options.length === 0) {
      return;
    }

    const selectable = options
      .map((option) => option.id)
      .filter((id) => id !== OTHER_OPTION_ID && id !== NONE_OPTION_ID);

    if (selectable.length === 0) {
      return;
    }

    updateDraftAnswer(key, { type: "multi", value: selectable });
  };

  const validateAnswers = () => {
    const errors: Record<string, string> = {};
    pendingQuestions.forEach((question, index) => {
      const key = getQuestionKey(question, index);
      const draft = draftAnswers[key];

      if (!draft) {
        errors[key] = "请选择或填写答案。";
        return;
      }

      if (question.type === "text") {
        if (typeof draft.value !== "string" || !draft.value.trim()) {
          errors[key] = "请填写简短答案。";
        }
        return;
      }

      if (question.type === "single") {
        if (typeof draft.value !== "string" || !draft.value) {
          errors[key] = "请选择一个选项。";
          return;
        }
        if (draft.value === OTHER_OPTION_ID && !draft.other?.trim()) {
          errors[key] = "请填写其他选项。";
        }
        return;
      }

      if (question.type === "multi") {
        if (!Array.isArray(draft.value) || draft.value.length === 0) {
          errors[key] = "请选择至少一个选项。";
          return;
        }
        if (draft.value.includes(OTHER_OPTION_ID) && !draft.other?.trim()) {
          errors[key] = "请填写其他选项。";
        }
      }
    });

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAnswerSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (isLoading || isDisabled) {
      return;
    }

    if (!validateAnswers()) {
      logDebug("表单校验失败", fieldErrors);
      return;
    }

    const answers: Answer[] = pendingQuestions.map((question, index) => {
      const key = getQuestionKey(question, index);
      const draft = draftAnswers[key];

      const base: Answer = {
        type: question.type,
        value: draft?.value ?? "",
      };

      if (question.id) {
        base.question_id = question.id;
      }

      if (draft?.other?.trim()) {
        base.other = draft.other.trim();
      }

      return base;
    });

    const displayMessage = serializeFormMessage({
      questions: pendingQuestions,
      answers: draftAnswers,
    });
    const optimisticUserMessage: HistoryItem = {
      role: "user",
      content: displayMessage,
      timestamp: Date.now(),
    };

    logDebug("提交答案", { answers, displayMessage });

    setPendingQuestions([]);
    setDraftAnswers({});
    setFieldErrors({});

    await sendRequest({
      answers,
      message: displayMessage,
      optimisticUserMessage,
    });
  };

  const handleRetry = async () => {
    if (!retryPayload || isLoading || isDisabled) {
      return;
    }

    await sendRequest({
      message: retryPayload.message,
      answers: retryPayload.answers,
      appendUserMessage: false,
    });
  };

  const handleCopyFinalPrompt = async () => {
    if (!finalPrompt) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(finalPrompt);
        setCopyState("success");
      } else {
        throw new Error("Clipboard unavailable");
      }
    } catch (error) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = finalPrompt;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopyState(copied ? "success" : "error");
      } catch (fallbackError) {
        logDebug("复制失败", { error, fallbackError });
        setCopyState("error");
      }
    }

    setTimeout(() => setCopyState("idle"), 2000);
  };

  const handleDownloadFinalPrompt = () => {
    if (!finalPrompt) {
      return;
    }

    const blob = new Blob([finalPrompt], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `final-prompt-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSession = () => {
    const payload = {
      messages,
      final_prompt: finalPrompt,
      is_finished: isFinished,
      deliberations,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `session-${sessionId}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportArtifact = async () => {
    if (!finalPrompt || exportStatus === "saving") {
      return;
    }

    setExportStatus("saving");
    setExportError(null);

    try {
      const artifact = await createArtifactFromPrompt(projectId, finalPrompt);
      setExportStatus("success");
      router.push(`/artifacts/${artifact.id}?projectId=${projectId}`);
    } catch (error) {
      logDebug("导出制品失败", error);
      setExportStatus("error");
      setExportError(
        error instanceof Error ? error.message : "导出制品失败，请重试。"
      );
    }
  };

  const renderDeliberations = () => {
    if (!deliberations || deliberations.length === 0) {
      return null;
    }

    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-900 shadow-sm">
          <details open className="rounded-xl bg-white/70 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              多 Agent 评分过程（可收起）
            </summary>
            <div className="mt-3 space-y-4 text-sm text-slate-700">
              {deliberations.map((stage, index) => (
                <div key={`${stage.stage}-${index}`}>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    {stage.stage}
                  </p>
                  <div className="mt-2 space-y-2">
                    {stage.agents.map((agent, agentIndex) => (
                      <div
                        key={`${agent.name}-${agentIndex}`}
                        className="rounded-xl bg-slate-50 px-3 py-2"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                          <span>{agent.name}</span>
                          <span>评分：{agent.score}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {agent.stance}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {agent.rationale}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    综合结论：{stage.synthesis}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    );
  };

  const answeredCount = useMemo(
    () =>
      pendingQuestions.reduce((count, question, index) => {
        const key = getQuestionKey(question, index);
        const draft = draftAnswers[key];
        if (!draft) {
          return count;
        }

        if (question.type === "text") {
          return typeof draft.value === "string" && draft.value.trim()
            ? count + 1
            : count;
        }

        if (question.type === "single") {
          if (typeof draft.value !== "string" || !draft.value) {
            return count;
          }
          if (draft.value === OTHER_OPTION_ID && !draft.other?.trim()) {
            return count;
          }
          return count + 1;
        }

        if (question.type === "multi") {
          if (!Array.isArray(draft.value) || draft.value.length === 0) {
            return count;
          }
          if (draft.value.includes(OTHER_OPTION_ID) && !draft.other?.trim()) {
            return count;
          }
          return count + 1;
        }

        return count;
      }, 0),
    [pendingQuestions, draftAnswers]
  );
  const totalQuestions = pendingQuestions.length;
  const saveStatusLabel = useMemo(() => {
    if (saveStatus === "saving") {
      return "草稿保存中...";
    }
    if (saveStatus === "saved") {
      return "草稿已保存";
    }
    if (saveStatus === "error") {
      return "草稿保存失败";
    }
    return "";
  }, [saveStatus]);
  const showChatInput =
    !isLoading &&
    pendingQuestions.length === 0 &&
    (messages.length === 0 || isFinished || Boolean(finalPrompt));
  const showQuestionForm = pendingQuestions.length > 0;
  const isRefineMode = Boolean(finalPrompt) || isFinished;
  const inputLabel = isRefineMode ? "继续修改" : "先说一句";
  const inputPlaceholder = isRefineMode
    ? "例如：语气更专业，输出结构化要点"
    : "例如：我要做一个动物介绍页";
  const inputButtonLabel = isRefineMode ? "发送修改" : "开始引导";

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div
        data-chat-messages
        ref={listRef}
        className="flex-1 min-h-0 space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white/70 p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            发送一句话开始引导，或直接点击开始。
          </div>
        ) : (
          messages.map((item, index) => {
            const isUser = item.role === "user";
            const formPayload = parseFormMessage(item.content);
            return (
              <div
                key={`${item.timestamp}-${index}`}
                className={isUser ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={[
                    "max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                    isUser
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-900",
                  ].join(" ")}
                >
                  {formPayload ? (
                    <div
                      className={[
                        "space-y-3 text-xs leading-relaxed",
                        isUser ? "text-slate-100" : "text-slate-700",
                      ].join(" ")}
                    >
                      {formPayload.questions.map((question, questionIndex) => {
                        const key = getQuestionKey(question, questionIndex);
                        const draft = formPayload.answers[key];
                        const answerText = formatDraftAnswer(question, draft);
                        return (
                          <div key={key} className="space-y-1">
                            <p
                              className={[
                                "text-[11px] uppercase tracking-[0.28em]",
                                isUser ? "text-slate-300" : "text-slate-400",
                              ].join(" ")}
                            >
                              {shouldShowStep(question.step)
                                ? question.step
                                : `问题 ${questionIndex + 1}`}
                            </p>
                            <p
                              className={[
                                "text-sm font-semibold",
                                isUser ? "text-white" : "text-slate-900",
                              ].join(" ")}
                            >
                              {question.text}
                            </p>
                            <p
                              className={[
                                "text-sm",
                                isUser ? "text-slate-100" : "text-slate-700",
                              ].join(" ")}
                            >
                              {answerText}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap break-words leading-relaxed [&_code]:rounded [&_code]:bg-slate-200/80 [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {item.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {showQuestionForm ? (
          <div className="flex justify-start">
            <form
              onSubmit={handleAnswerSubmit}
              className="w-full rounded-2xl border border-slate-200 bg-white/70 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <p className="uppercase tracking-[0.32em]">请完成以下问题</p>
                <span>
                  已填写 {answeredCount}/{totalQuestions}
                </span>
              </div>
              <div className="mt-3 divide-y divide-slate-200/60">
                {pendingQuestions.map((question, index) => {
                  const key = getQuestionKey(question, index);
                  const draft = draftAnswers[key];
                  const allowOther = question.allow_other ?? question.type !== "text";
                  const allowNone = question.allow_none ?? question.type !== "text";
                  const options = normalizeOptions(question, allowOther, allowNone);
                  const selectedCount =
                    question.type === "multi" && Array.isArray(draft?.value)
                      ? draft.value.length
                      : 0;

                  return (
                    <div key={key} className="py-4 first:pt-0 last:pb-0">
                      {shouldShowStep(question.step) ? (
                        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                          {question.step}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {question.text}
                      </p>
                      {question.type === "multi" ? (
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                          <span>
                            {question.max_select
                              ? `已选 ${selectedCount}/${question.max_select}`
                              : "可多选"}
                          </span>
                          {options.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleSelectAll(key, options)}
                              className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600 transition hover:bg-slate-200"
                            >
                              全选
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {question.type === "multi" && question.max_select ? (
                        <p className="mt-1 text-[11px] text-slate-400">
                          全选可超过上限，提交时仍会带上全部选择。
                        </p>
                      ) : null}

                      {question.type === "text" ? (
                        <input
                          name={`question-${key}`}
                          value={typeof draft?.value === "string" ? draft.value : ""}
                          onChange={(event) =>
                            handleTextChange(key, event.target.value)
                          }
                          placeholder={
                            question.placeholder ?? "请用简短短语回答（最多 120 字）"
                          }
                          maxLength={120}
                          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                          disabled={isLoading || isDisabled}
                        />
                      ) : (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {options.length === 0 ? (
                            <p className="text-xs text-slate-400">
                              暂无可选项，请输入简短描述。
                            </p>
                          ) : null}
                          {options.map((option) => {
                            const isSelected =
                              question.type === "single"
                                ? draft?.value === option.id
                                : Array.isArray(draft?.value) &&
                                  draft?.value.includes(option.id);
                            return (
                              <label
                                key={option.id}
                                className={[
                                  "relative flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
                                  isSelected
                                    ? "bg-slate-900 text-white"
                                    : "bg-slate-50 text-slate-700 hover:bg-slate-100",
                                ].join(" ")}
                              >
                                <input
                                  type={
                                    question.type === "single" ? "radio" : "checkbox"
                                  }
                                  name={`question-${key}`}
                                  value={option.id}
                                  className="sr-only"
                                  checked={isSelected}
                                  onChange={() => {
                                    if (question.type === "single") {
                                      handleSingleSelect(key, option.id);
                                    } else {
                                      handleMultiToggle(
                                        key,
                                        option.id,
                                        question.max_select
                                      );
                                    }
                                  }}
                                  disabled={isLoading || isDisabled}
                                />
                                {option.label}
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {question.type !== "text" ? (
                        <>
                          {question.type === "single" &&
                          draft?.value === OTHER_OPTION_ID ? (
                            <input
                              name={`question-${key}-other`}
                              value={draft?.other ?? ""}
                              onChange={(event) =>
                                handleOtherChange(key, event.target.value)
                              }
                              placeholder="简单说明即可（最多 80 字）"
                              maxLength={80}
                              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                              disabled={isLoading || isDisabled}
                            />
                          ) : null}
                          {question.type === "multi" &&
                          Array.isArray(draft?.value) &&
                          draft.value.includes(OTHER_OPTION_ID) ? (
                            <input
                              name={`question-${key}-other`}
                              value={draft?.other ?? ""}
                              onChange={(event) =>
                                handleOtherChange(key, event.target.value)
                              }
                              placeholder="简单说明即可（最多 80 字）"
                              maxLength={80}
                              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                              disabled={isLoading || isDisabled}
                            />
                          ) : null}
                        </>
                      ) : null}

                      {fieldErrors[key] ? (
                        <p className="mt-2 text-xs text-rose-500">
                          {fieldErrors[key]}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                {formError ? (
                  <div className="flex items-center gap-2 text-xs text-rose-500">
                    <span>{formError}</span>
                    {retryPayload ? (
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-600 transition hover:bg-rose-100"
                        disabled={isLoading || isDisabled}
                      >
                        重试
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">{saveStatusLabel}</span>
                )}
                <button
                  type="submit"
                  disabled={isLoading || isDisabled}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  确认提交
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-xs text-slate-500">
              AI 正在思考
              <span className="typing-dot" />
              <span className="typing-dot typing-dot-delay-1" />
              <span className="typing-dot typing-dot-delay-2" />
            </div>
          </div>
        ) : null}

        {renderDeliberations()}

        {finalPrompt ? (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-900 shadow-sm">
              <section className="rounded-xl bg-emerald-50/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.32em] text-emerald-700">
                    最终 Prompt
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyFinalPrompt}
                      className="rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
                    >
                      {copyState === "success"
                        ? "已复制"
                        : copyState === "error"
                          ? "复制失败"
                          : "复制"}
                    </button>
                    <button
                      type="button"
                      onClick={handleExportArtifact}
                      className="rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={exportStatus === "saving"}
                    >
                      {exportStatus === "saving" ? "导出中..." : "导出为制品"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadFinalPrompt}
                      className="rounded-lg border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                    >
                      下载
                    </button>
                    <button
                      type="button"
                      onClick={handleExportSession}
                      className="rounded-lg border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                    >
                      导出 JSON
                    </button>
                  </div>
                </div>
                {copyState === "error" ? (
                  <p className="mt-2 text-xs text-rose-500">
                    复制失败，请手动选择文本复制。
                  </p>
                ) : null}
                {exportStatus === "error" ? (
                  <p className="mt-2 text-xs text-rose-500">
                    {exportError ?? "导出制品失败，请重试。"}
                  </p>
                ) : null}
                {exportStatus === "success" ? (
                  <p className="mt-2 text-xs text-emerald-700">
                    已导出为制品，正在打开详情页。
                  </p>
                ) : null}
                <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-emerald-900">
                  {finalPrompt}
                </pre>
              </section>
            </div>
          </div>
        ) : null}
      </div>

      {showChatInput ? (
        <form onSubmit={handleStartSubmit} className="mt-4 flex flex-col gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
            <label className="text-xs uppercase tracking-[0.32em] text-slate-400">
              {inputLabel}
            </label>
            <textarea
              ref={textareaRef}
              name="initial-message"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitInitialMessage(messages.length === 0);
                }
              }}
              placeholder={inputPlaceholder}
              maxLength={200}
              rows={1}
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              disabled={isLoading || isDisabled}
            />
            <p className="mt-2 text-[11px] text-slate-400">
              回车发送，Shift+Enter 换行
            </p>
          </div>
          <button
            type="submit"
            disabled={isLoading || isDisabled}
            className="self-end rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {inputButtonLabel}
          </button>
          {formError ? (
            <div className="flex items-center gap-2 text-xs text-rose-500">
              <span>{formError}</span>
              {retryPayload ? (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-600 transition hover:bg-rose-100"
                  disabled={isLoading || isDisabled}
                >
                  重试
                </button>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

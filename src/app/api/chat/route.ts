import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { ai, getCompatModel } from "../../../../lib/genkit";
import { prisma } from "../../../../lib/prisma";
import {
  ChatRequestSchema,
  GuardPromptReviewSchema,
  HistoryItemSchema,
  LLMResponseSchema,
  SessionStateSchema,
} from "../../../../lib/schemas";
import {
  deriveTitleFromPrompt,
  extractTemplateVariables,
} from "../../../../lib/template";

const historyArraySchema = HistoryItemSchema.array();
const isDebug = process.env.NODE_ENV !== "production";
const REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? "180000");
const MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES ?? "2");
const MAX_HISTORY_ITEMS = Number(process.env.MAX_HISTORY_ITEMS ?? "60");
const MAX_QUESTION_ROUNDS = Number(process.env.MAX_QUESTION_ROUNDS ?? "3");
const MIN_PROMPT_VARIABLES = Number(process.env.MIN_PROMPT_VARIABLES ?? "3");
const FORM_MESSAGE_PREFIX = "__FORM__:";

const resolveOptionLabel = (
  options: { id?: string; label?: string }[] | undefined,
  value: string
) =>
  options?.find((option) => option.id === value)?.label ?? value;

const formatFormAnswer = (
  question: {
    type?: string;
    text?: string;
    options?: { id?: string; label?: string }[];
  },
  draft: { type?: string; value?: unknown; other?: string } | undefined
) => {
  if (!draft) {
    return "未填写";
  }

  const value = draft.value;
  if (question.type === "text") {
    return typeof value === "string" && value.trim() ? value.trim() : "未填写";
  }

  if (question.type === "single") {
    if (typeof value !== "string" || !value) {
      return "未填写";
    }
    if (value === "__other__") {
      return draft.other?.trim() ? `其他：${draft.other.trim()}` : "其他";
    }
    if (value === "__none__") {
      return "不需要此功能";
    }
    return resolveOptionLabel(question.options, value);
  }

  if (question.type === "multi") {
    if (!Array.isArray(value) || value.length === 0) {
      return "未填写";
    }
    if (value.includes("__none__")) {
      return "不需要此功能";
    }
    return value
      .map((item) => {
        if (item === "__other__") {
          return draft.other?.trim() ? `其他：${draft.other.trim()}` : "其他";
        }
        if (typeof item === "string") {
          return resolveOptionLabel(question.options, item);
        }
        return "";
      })
      .filter(Boolean)
      .join("、");
  }

  return "未填写";
};

const formatFormMessageForLLM = (content: string) => {
  if (!content.startsWith(FORM_MESSAGE_PREFIX)) {
    return null;
  }
  const raw = content.slice(FORM_MESSAGE_PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as {
      questions?: {
        id?: string;
        text?: string;
        type?: string;
        options?: { id?: string; label?: string }[];
      }[];
      answers?: Record<string, { type?: string; value?: unknown; other?: string }>;
    };
    if (!parsed || !Array.isArray(parsed.questions)) {
      return null;
    }
    const lines = parsed.questions.map((question, index) => {
      const key =
        typeof question.id === "string" && question.id
          ? question.id
          : `q-${index}`;
      const title =
        typeof question.text === "string" && question.text
          ? question.text
          : `问题 ${index + 1}`;
      const draft = parsed.answers?.[key];
      const answerText = formatFormAnswer(question, draft);
      return `- ${title}：${answerText}`;
    });
    if (lines.length === 0) {
      return null;
    }
    return `表单回答:\n${lines.join("\n")}`;
  } catch {
    return null;
  }
};
const isRetryableError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: string; message?: string };
  const message = record.message?.toLowerCase() ?? "";
  const code = record.code?.toLowerCase() ?? "";

  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    code.includes("timeout") ||
    code === "etimedout" ||
    code === "econnreset" ||
    code === "err_socket_timeout" ||
    code === "eai_again"
  );
};

const generateWithRetry = async (payload: Parameters<typeof ai.generate>[0]) => {
  const attempts = Math.max(1, MAX_RETRIES);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const timeout =
      Number.isFinite(REQUEST_TIMEOUT_MS) && REQUEST_TIMEOUT_MS > 0
        ? REQUEST_TIMEOUT_MS
        : 60000;
    const startedAt = Date.now();
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        const error = new Error("LLM request timeout");
        clearTimeout(timer);
        reject(error);
      }, timeout);
    });

    try {
      const llmResult = (await Promise.race([
        ai.generate(payload),
        timeoutPromise,
      ])) as Awaited<ReturnType<typeof ai.generate>>;
      if (isDebug) {
        console.info("[api/chat] llm attempt ok", {
          attempt,
          ms: Date.now() - startedAt,
        });
      }
      return llmResult;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);
      console.error("[api/chat] llm attempt failed", {
        attempt,
        retryable,
        message: error instanceof Error ? error.message : "unknown",
      });
      if (!retryable || attempt === attempts) {
        throw error;
      }
      const backoffMs = 400 * attempt;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError;
};

const jsonWithTrace = (
  payload: Record<string, unknown>,
  init: { status?: number } | undefined,
  traceId: string
) => {
  const httpResponse = NextResponse.json(payload, init);
  httpResponse.headers.set("x-trace-id", traceId);
  return httpResponse;
};

const buildSystemPrompt = ({
  completedRounds,
  roundLimit,
  forceFinalize,
}: {
  completedRounds: number;
  roundLimit: number;
  forceFinalize: boolean;
}) => {
  const hasLimit = Number.isFinite(roundLimit) && roundLimit > 0;
  const roundHint = hasLimit
    ? forceFinalize
      ? `当前已达到追问上限 ${roundLimit} 轮，必须直接输出 final_prompt 并结束。`
      : `当前已完成 ${completedRounds}/${roundLimit} 轮追问，请尽量在剩余轮次内完成信息收集。`
    : "请尽量减少轮次，优先覆盖所有关键问题。";

  return [
    "你是一个 Prompt 专家与需求分析师。",
    "目标：尽量用更少轮次收集信息；每轮问题数量不设硬上限，但应一次覆盖所有剩余关键点。",
    roundHint,
    "输出必须是合法 JSON（不要用 Markdown 包裹），严格符合下列结构：",
    "{",
    '  "reply": string,',
    '  "final_prompt": string | null,',
    '  "is_finished": boolean,',
    '  "questions": [',
    "    {",
    '      "id"?: string,',
    '      "step"?: string,',
    '      "text": string,',
    '      "type": "single" | "multi" | "text",',
    '      "options"?: [{ "id": string, "label": string }],',
    '      "allow_other"?: boolean,',
    '      "allow_none"?: boolean,',
    '      "max_select"?: number,',
    '      "placeholder"?: string',
    "    }",
    "  ]",
    '  "deliberations": [',
    "    {",
    '      "stage": string,',
    '      "agents": [',
    '        { "name": string, "stance": string, "score": number, "rationale": string }',
    "      ],",
    '      "synthesis": string',
    "    }",
    "  ]",
    "}",
    "规则：",
    "- questions 必须存在，可为空数组表示无问题。",
    "- single/multi 必须提供 options。",
    "- multi 若有限制请选择 max_select。",
    "- single/multi 尽量设置 allow_other 与 allow_none 为 true。",
    "- 用户回答可能包含结构化 answers 数组（内部结构），请解析后继续推进。",
    "- 不要向用户透露任何内部字段或协议说明。",
    "- 不要包含 mermaid 字段或任何未声明字段。",
    "- deliberations 用于展示多 Agent 评分过程：建议 1-2 个阶段、2-3 个 Agent，分数 0-10。",
    "- 每次响应至少返回 1 个 deliberation。",
    "- answers 内部约定：value 为 '__other__' 表示选择了“其他”，此时 other 字段为用户输入；value 为 '__none__' 表示“不需要此功能”。严禁向用户解释这些约定。",
    "- final_prompt 必须是“制品模板”，包含可配置变量占位符，格式为 {{variable_name}}。",
    `- final_prompt 至少包含 ${Number.isFinite(MIN_PROMPT_VARIABLES) ? MIN_PROMPT_VARIABLES : 3} 个占位符，变量名只能使用英文字母、数字与下划线，且以字母开头。`,
    "- 变量建议覆盖：主题/目标、受众/角色、输出格式/风格、约束/规则、输入/示例等（至少覆盖三类）。",
    "- 即使已确定具体值，也应保留占位符，并可在括号中写默认值示例。",
    forceFinalize
      ? "- 已到追问上限：必须输出 final_prompt（不可为 null/空字符串），is_finished=true，questions=[]。"
      : "- 若信息已足够，请直接输出 final_prompt 并将 questions 设为空数组。",
    "不要输出任何额外文本。",
  ].join("\n");
};

const buildGuardPrompt = (minVariables: number) =>
  [
    "你是制品 Prompt 的 Guard Prompt 审核器。",
    "目标：确保 final_prompt 是可复用模板，包含足够的 {{variable}} 占位符用于方向控制。",
    "审核要点：",
    "- 必须使用 {{variable_name}} 语法。",
    "- 至少包含指定数量的占位符。",
    "- 变量名仅允许英文字母/数字/下划线，且以字母开头。",
    "- 变量应覆盖至少三类：主题/目标、受众/角色、输出格式/风格、约束/规则、输入/示例（可自行判断类别映射）。",
    "- 不要移除关键结构，只在必要时把固定内容替换为占位符。",
    "若不通过，请给出 revised_prompt（修复后的完整 prompt）。",
    "输出严格 JSON：",
    "{",
    '  "pass": boolean,',
    '  "issues": string[],',
    '  "revised_prompt": string | null,',
    '  "variables": string[]',
    "}",
    `最低占位符数量: ${Number.isFinite(minVariables) ? minVariables : 3}`,
    "不要输出任何额外文本。",
  ].join("\n");

const runGuardReview = async (prompt: string) => {
  const guardPrompt = buildGuardPrompt(MIN_PROMPT_VARIABLES);
  const guardResponse = await generateWithRetry({
    model: getCompatModel(process.env.OPENAI_MODEL),
    messages: [
      { role: "system", content: [{ text: guardPrompt }] },
      { role: "user", content: [{ text: prompt }] },
    ],
    output: { schema: GuardPromptReviewSchema },
  });
  return guardResponse.output;
};

const normalizeLlmResponse = (raw: unknown) => {
  const responsePayload = LLMResponseSchema.parse(raw);
  const normalizedQuestions = responsePayload.questions.map((question, index) => {
    const id = question.id ?? `q${index + 1}`;
    if (question.type === "text") {
      return {
        ...question,
        id,
        options: undefined,
        max_select: undefined,
        allow_other: undefined,
        allow_none: undefined,
      };
    }

    const options = question.options ?? [];
    if (options.length === 0) {
      throw new Error(`Invalid question options for ${id}`);
    }

    return {
      ...question,
      id,
      options,
      allow_other: question.allow_other ?? true,
      allow_none: question.allow_none ?? true,
      max_select: question.type === "multi" ? question.max_select : undefined,
    };
  });

  return {
    ...responsePayload,
    questions: normalizedQuestions,
  };
};

export async function POST(req: Request) {
  const startedAt = Date.now();
  let traceId = randomUUID();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    console.error("[api/chat] Invalid JSON");
    return jsonWithTrace({ error: "Invalid JSON" }, { status: 400 }, traceId);
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[api/chat] Invalid request", parsed.error.flatten());
    return jsonWithTrace({ error: "Invalid request" }, { status: 400 }, traceId);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("[api/chat] Missing OPENAI_API_KEY");
    return jsonWithTrace(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500 },
      traceId
    );
  }

  if (!process.env.OPENAI_BASE_URL) {
    console.error("[api/chat] Missing OPENAI_BASE_URL");
    return jsonWithTrace(
      { error: "Missing OPENAI_BASE_URL" },
      { status: 500 },
      traceId
    );
  }

  if (!process.env.OPENAI_MODEL) {
    console.error("[api/chat] Missing OPENAI_MODEL");
    return jsonWithTrace(
      { error: "Missing OPENAI_MODEL" },
      { status: 500 },
      traceId
    );
  }

  const { projectId, sessionId, message, answers } = parsed.data;
  traceId = parsed.data.traceId ?? traceId;

  console.info("[api/chat] request", {
    projectId,
    sessionId,
    hasMessage: Boolean(message),
    answersCount: answers?.length ?? 0,
    traceId,
  });

  try {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, projectId },
    });

    if (!session) {
      console.error("[api/chat] Session not found", { projectId, sessionId });
      return jsonWithTrace(
        { error: "Session not found" },
        { status: 404 },
        traceId
      );
    }

    const historyParsed = historyArraySchema.safeParse(session.history);
    const history = historyParsed.success ? historyParsed.data : [];
    const trimmedHistory =
      Number.isFinite(MAX_HISTORY_ITEMS) && MAX_HISTORY_ITEMS > 0
        ? history.slice(-MAX_HISTORY_ITEMS)
        : history;
    const completedRounds = history.filter((item) => item.role === "assistant")
      .length;
    const shouldForceFinalize =
      Number.isFinite(MAX_QUESTION_ROUNDS) &&
      MAX_QUESTION_ROUNDS > 0 &&
      completedRounds >= MAX_QUESTION_ROUNDS;
    const systemPrompt = buildSystemPrompt({
      completedRounds,
      roundLimit: MAX_QUESTION_ROUNDS,
      forceFinalize: shouldForceFinalize,
    });

    const isFormMessage =
      typeof message === "string" && message.startsWith(FORM_MESSAGE_PREFIX);
    const formattedFormMessage =
      typeof message === "string" ? formatFormMessageForLLM(message) : null;
    const userContent = answers
      ? `用户回答(JSON): ${JSON.stringify(answers)}${
          formattedFormMessage
            ? `\n${formattedFormMessage}`
            : message && !isFormMessage
              ? `\n补充说明: ${message}`
              : ""
        }`
      : formattedFormMessage ?? message ?? "";

    const llmResponse = await generateWithRetry({
      model: getCompatModel(process.env.OPENAI_MODEL),
      messages: [
        { role: "system", content: [{ text: systemPrompt }] },
        ...trimmedHistory.map((item) => {
          const content =
            item.role === "user"
              ? formatFormMessageForLLM(item.content) ?? item.content
              : item.content;
          return {
            role: item.role === "assistant" ? "model" : "user",
            content: [{ text: content }],
          };
        }),
        { role: "user", content: [{ text: userContent }] },
      ],
      output: { schema: LLMResponseSchema },
    });

    let normalizedResponse = normalizeLlmResponse(llmResponse.output);
    if (
      shouldForceFinalize &&
      (!normalizedResponse.is_finished ||
        !normalizedResponse.final_prompt?.trim() ||
        normalizedResponse.questions.length > 0)
    ) {
      console.warn("[api/chat] force finalize retry", {
        completedRounds,
        roundLimit: MAX_QUESTION_ROUNDS,
      });
      const retryPrompt = buildSystemPrompt({
        completedRounds,
        roundLimit: MAX_QUESTION_ROUNDS,
        forceFinalize: true,
      });
      const retryResponse = await generateWithRetry({
        model: getCompatModel(process.env.OPENAI_MODEL),
        messages: [
          { role: "system", content: [{ text: retryPrompt }] },
          ...trimmedHistory.map((item) => {
            const content =
              item.role === "user"
                ? formatFormMessageForLLM(item.content) ?? item.content
                : item.content;
            return {
              role: item.role === "assistant" ? "model" : "user",
              content: [{ text: content }],
            };
          }),
          { role: "user", content: [{ text: userContent }] },
        ],
        output: { schema: LLMResponseSchema },
      });
      normalizedResponse = normalizeLlmResponse(retryResponse.output);
    }

    if (normalizedResponse.final_prompt?.trim()) {
      const resolvedMinVariables =
        Number.isFinite(MIN_PROMPT_VARIABLES) && MIN_PROMPT_VARIABLES > 0
          ? MIN_PROMPT_VARIABLES
          : 3;
      const initialPrompt = normalizedResponse.final_prompt.trim();
      const guardReview = await runGuardReview(initialPrompt);
      let finalPrompt = initialPrompt;
      let review = guardReview;

      if (!guardReview.pass) {
        const revised = guardReview.revised_prompt?.trim() ?? "";
        if (!revised) {
          console.error("[api/chat] guard failed without revision", {
            issues: guardReview.issues,
          });
          throw new Error("Prompt guard failed");
        }
        const secondReview = await runGuardReview(revised);
        if (!secondReview.pass) {
          console.error("[api/chat] guard revision failed", {
            issues: secondReview.issues,
          });
          throw new Error("Prompt guard failed");
        }
        finalPrompt = revised;
        review = secondReview;
      }

      const variables = extractTemplateVariables(finalPrompt);
      if (variables.length < resolvedMinVariables) {
        console.error("[api/chat] guard variable count insufficient", {
          variables,
          resolvedMinVariables,
        });
        throw new Error("Prompt guard failed");
      }

      if (isDebug) {
        console.info("[api/chat] guard review", review);
      }

      normalizedResponse = {
        ...normalizedResponse,
        final_prompt: finalPrompt,
      };
    }
    const sessionState = SessionStateSchema.parse({
      questions: normalizedResponse.questions,
      deliberations: normalizedResponse.deliberations,
      final_prompt: normalizedResponse.final_prompt,
      is_finished: normalizedResponse.is_finished,
      title: normalizedResponse.final_prompt
        ? deriveTitleFromPrompt(normalizedResponse.final_prompt)
        : null,
    });

    if (isDebug) {
      console.info("[api/chat] llm response", normalizedResponse);
    } else {
      console.info("[api/chat] llm response", {
        is_finished: normalizedResponse.is_finished,
        reply_length: normalizedResponse.reply.length,
        questions_count: normalizedResponse.questions.length,
        has_final_prompt: Boolean(normalizedResponse.final_prompt?.trim()),
      });
    }

    const updatedHistory = [
      ...history,
      {
        role: "user",
        content: message ?? userContent,
        timestamp: Date.now(),
      },
      {
        role: "assistant",
        content: normalizedResponse.reply,
        timestamp: Date.now(),
      },
    ];
    const prunedHistory =
      Number.isFinite(MAX_HISTORY_ITEMS) && MAX_HISTORY_ITEMS > 0
        ? updatedHistory.slice(-MAX_HISTORY_ITEMS)
        : updatedHistory;

    await prisma.session.update({
      where: { id: session.id },
      data: { history: prunedHistory, state: sessionState },
    });

    console.info("[api/chat] done", { ms: Date.now() - startedAt });
    return jsonWithTrace(normalizedResponse, undefined, traceId);
  } catch (error) {
    console.error("[api/chat] error", { traceId, error });
    const isTimeout =
      error instanceof Error &&
      (error.message.toLowerCase().includes("timeout") ||
        error.message.toLowerCase().includes("timed out"));
    return jsonWithTrace(
      { error: isTimeout ? "LLM request timeout" : "Server error" },
      { status: isTimeout ? 504 : 500 },
      traceId
    );
  }
}

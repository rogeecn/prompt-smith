import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { ai, getCompatModel } from "../../../../../lib/genkit";
import { resolveModelConfig } from "../../../../../lib/model-config";
import { prisma } from "../../../../../lib/prisma";
import {
  ArtifactVariablesSchema,
  HistoryItemSchema,
} from "../../../../../lib/schemas";
import { extractTemplateVariables, renderTemplate } from "../../../../../lib/template";
import { getSession } from "../../../../lib/auth";

const historyArraySchema = HistoryItemSchema.array();
const isDebug = process.env.NODE_ENV !== "production";
const REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? "180000");
const MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES ?? "2");
const MAX_HISTORY_ITEMS = Number(process.env.MAX_HISTORY_ITEMS ?? "60");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isValidInputValue = (value: unknown) => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => typeof item === "string");
  }

  return false;
};

const parseArtifactChatRequest = (value: unknown) => {
  if (!isRecord(value)) {
    return { success: false, error: "Invalid request" } as const;
  }

  const projectId = typeof value.projectId === "string" ? value.projectId : "";
  if (!UUID_REGEX.test(projectId)) {
    return { success: false, error: "Invalid projectId" } as const;
  }

  const artifactId = typeof value.artifactId === "string" ? value.artifactId : "";
  if (!artifactId) {
    return { success: false, error: "Invalid artifactId" } as const;
  }

  const sessionId =
    typeof value.sessionId === "string" && value.sessionId.trim()
      ? value.sessionId
      : undefined;

  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (!message || message.length > 4000) {
    return { success: false, error: "Invalid message" } as const;
  }

  const traceId =
    typeof value.traceId === "string" && value.traceId.trim()
      ? value.traceId
      : undefined;

  let inputs: Record<string, unknown> | undefined;
  if (value.inputs !== undefined) {
    if (!isRecord(value.inputs)) {
      return { success: false, error: "Invalid inputs" } as const;
    }
    for (const entry of Object.values(value.inputs)) {
      if (!isValidInputValue(entry)) {
        return { success: false, error: "Invalid inputs" } as const;
      }
    }
    inputs = value.inputs;
  }

  return {
    success: true,
    data: { projectId, artifactId, sessionId, message, traceId, inputs },
  } as const;
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

const generateWithRetry = async (payload: unknown) => {
  const attempts = Math.max(1, MAX_RETRIES);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const timeout =
      Number.isFinite(REQUEST_TIMEOUT_MS) && REQUEST_TIMEOUT_MS > 0
        ? REQUEST_TIMEOUT_MS
        : 60000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        const error = new Error("LLM request timeout");
        clearTimeout(timer);
        reject(error);
      }, timeout);
    });

    try {
      return (await Promise.race([
        ai.generate(payload as Parameters<typeof ai.generate>[0]),
        timeoutPromise,
      ])) as Awaited<ReturnType<typeof ai.generate>>;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);
      console.error("[api/artifacts/chat] llm attempt failed", {
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

const normalizeArtifactVariables = (value: unknown) => {
  const parsed = ArtifactVariablesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};

const parseListValue = (value: string) =>
  value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

const resolveInputs = (
  variables: ReturnType<typeof normalizeArtifactVariables>,
  rawInputs: Record<string, unknown> | undefined
) => {
  const inputs = rawInputs ?? {};
  const renderedValues: Record<string, string> = {};
  const errors: string[] = [];

  variables.forEach((variable) => {
    const key = variable.key;
    const hasInput = Object.prototype.hasOwnProperty.call(inputs, key);
    const rawValue = hasInput ? inputs[key] : variable.default;

    const isMissing =
      rawValue === undefined ||
      rawValue === null ||
      (typeof rawValue === "string" && rawValue.trim() === "");

    if (isMissing) {
      if (variable.required ?? true) {
        errors.push(`变量 ${key} 为空`);
      }
      renderedValues[key] = "";
      return;
    }

    if (variable.type === "number") {
      const numberValue =
        typeof rawValue === "number"
          ? rawValue
          : typeof rawValue === "string"
            ? Number(rawValue)
            : NaN;
      if (Number.isNaN(numberValue)) {
        errors.push(`变量 ${key} 必须为数字`);
        return;
      }
      renderedValues[key] = String(numberValue);
      return;
    }

    if (variable.type === "boolean") {
      const booleanValue =
        typeof rawValue === "boolean"
          ? rawValue
          : rawValue === "true"
            ? true
            : rawValue === "false"
              ? false
              : null;
      if (booleanValue === null) {
        errors.push(`变量 ${key} 必须为布尔值`);
        return;
      }
      renderedValues[key] = booleanValue
        ? variable.true_label ?? "true"
        : variable.false_label ?? "false";
      return;
    }

    if (variable.type === "list") {
      const listValue = Array.isArray(rawValue)
        ? rawValue.map((item) => String(item))
        : typeof rawValue === "string"
          ? parseListValue(rawValue)
          : [];
      if ((variable.required ?? true) && listValue.length === 0) {
        errors.push(`变量 ${key} 不能为空`);
        return;
      }
      const joiner = variable.joiner ?? "、";
      renderedValues[key] = listValue.join(joiner);
      return;
    }

    if (variable.type === "enum") {
      if (typeof rawValue !== "string") {
        errors.push(`变量 ${key} 必须为字符串`);
        return;
      }
      let resolvedValue = rawValue;
      if (resolvedValue.includes(",") || resolvedValue.includes("，")) {
        const candidates = parseListValue(resolvedValue);
        if (
          candidates.length > 0 &&
          (!variable.options ||
            candidates.every((item) => variable.options?.includes(item)))
        ) {
          resolvedValue = candidates[0];
        }
      }
      if (variable.options && !variable.options.includes(resolvedValue)) {
        errors.push(`变量 ${key} 不在可选项中`);
        return;
      }
      renderedValues[key] = resolvedValue;
      return;
    }

    if (typeof rawValue !== "string") {
      errors.push(`变量 ${key} 必须为字符串`);
      return;
    }

    if ((variable.required ?? true) && !rawValue.trim()) {
      errors.push(`变量 ${key} 不能为空`);
      return;
    }

    renderedValues[key] = rawValue;
  });

  return { renderedValues, errors };
};

export async function POST(req: Request) {
  const startedAt = Date.now();
  let traceId: string = randomUUID();
  let body: unknown;
  const authSession = await getSession();
  if (!authSession) {
    return jsonWithTrace({ error: "Unauthorized" }, { status: 401 }, traceId);
  }
  try {
    body = await req.json();
  } catch {
    console.error("[api/artifacts/chat] Invalid JSON");
    return jsonWithTrace({ error: "Invalid JSON" }, { status: 400 }, traceId);
  }

  const parsed = parseArtifactChatRequest(body);
  if (!parsed.success) {
    console.error("[api/artifacts/chat] Invalid request", parsed.error);
    return jsonWithTrace({ error: "Invalid request" }, { status: 400 }, traceId);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("[api/artifacts/chat] Missing OPENAI_API_KEY");
    return jsonWithTrace(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500 },
      traceId
    );
  }

  if (!process.env.OPENAI_BASE_URL) {
    console.error("[api/artifacts/chat] Missing OPENAI_BASE_URL");
    return jsonWithTrace(
      { error: "Missing OPENAI_BASE_URL" },
      { status: 500 },
      traceId
    );
  }

  let modelConfig: ReturnType<typeof resolveModelConfig>;
  try {
    modelConfig = resolveModelConfig(null);
  } catch (error) {
    console.error(
      "[api/artifacts/chat] Missing OPENAI_MODELS or OPENAI_MODEL",
      { error }
    );
    return jsonWithTrace(
      { error: "Missing OPENAI_MODELS or OPENAI_MODEL" },
      { status: 500 },
      traceId
    );
  }

  const modelRef = getCompatModel(modelConfig.model);

  const { projectId, artifactId, sessionId, message, inputs } = parsed.data;
  traceId = parsed.data.traceId ?? traceId;
  if (isDebug) {
    console.info("[api/artifacts/chat] request", {
      projectId,
      artifactId,
      sessionId,
      hasMessage: Boolean(message),
      traceId,
    });
  }

  try {
    const artifact = await prisma.artifact.findFirst({
      where: {
        id: artifactId,
        projectId,
        project: { userId: authSession.userId },
      },
      select: { id: true, prompt_content: true, variables: true },
    });

    if (!artifact) {
      console.error("[api/artifacts/chat] Artifact not found", {
        projectId,
        artifactId,
      });
      return jsonWithTrace(
        { error: "Artifact not found" },
        { status: 404 },
        traceId
      );
    }

    const variables = normalizeArtifactVariables(artifact.variables);
    const templateVariables = extractTemplateVariables(artifact.prompt_content);
    const missingDefinitions = templateVariables.filter(
      (key) => !variables.some((variable) => variable.key === key)
    );

    if (missingDefinitions.length > 0) {
      return jsonWithTrace(
        {
          error: `缺少变量配置：${missingDefinitions.join(", ")}`,
        },
        { status: 400 },
        traceId
      );
    }

    const { renderedValues, errors } = resolveInputs(
      variables,
      inputs
    );
    if (errors.length > 0) {
      return jsonWithTrace(
        {
          error: errors[0],
          details: errors,
        },
        { status: 400 },
        traceId
      );
    }

    const systemPrompt =
      templateVariables.length > 0
        ? renderTemplate(artifact.prompt_content, renderedValues)
        : artifact.prompt_content;

    let session = null;
    if (sessionId) {
      session = await prisma.artifactSession.findFirst({
        where: {
          id: sessionId,
          artifactId,
          artifact: { projectId, project: { userId: authSession.userId } },
        },
      });
      if (!session) {
        console.error("[api/artifacts/chat] Session not found", {
          projectId,
          artifactId,
          sessionId,
        });
        return jsonWithTrace(
          { error: "Session not found" },
          { status: 404 },
          traceId
        );
      }
    } else {
      session = await prisma.artifactSession.create({
        data: {
          id: randomUUID(),
          artifactId,
          history: [],
        },
      });
    }

    const historyParsed = historyArraySchema.safeParse(session.history);
    const history = historyParsed.success ? historyParsed.data : [];
    const trimmedHistory =
      Number.isFinite(MAX_HISTORY_ITEMS) && MAX_HISTORY_ITEMS > 0
        ? history.slice(-MAX_HISTORY_ITEMS)
        : history;

    const llmResponse = await generateWithRetry({
      model: modelRef,
      messages: [
        { role: "system", content: [{ text: systemPrompt }] },
        ...trimmedHistory.map((item) => ({
          role: item.role === "assistant" ? "model" : "user",
          content: [{ text: item.content }],
        })),
        { role: "user", content: [{ text: message }] },
      ],
    });

    const reply = llmResponse.text?.trim() ?? "";
    if (!reply) {
      throw new Error("Empty response");
    }

    const updatedHistory = [
      ...history,
      { role: "user", content: message, timestamp: Date.now() },
      { role: "assistant", content: reply, timestamp: Date.now() },
    ];
    const prunedHistory =
      Number.isFinite(MAX_HISTORY_ITEMS) && MAX_HISTORY_ITEMS > 0
        ? updatedHistory.slice(-MAX_HISTORY_ITEMS)
        : updatedHistory;

    await prisma.artifactSession.update({
      where: { id: session.id },
      data: { history: prunedHistory },
    });

    if (isDebug) {
      console.info("[api/artifacts/chat] response", {
        reply_length: reply.length,
      });
    }

    console.info("[api/artifacts/chat] done", { ms: Date.now() - startedAt });
    return jsonWithTrace({ reply, sessionId: session.id }, undefined, traceId);
  } catch (error) {
    console.error("[api/artifacts/chat] error", { traceId, error });
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

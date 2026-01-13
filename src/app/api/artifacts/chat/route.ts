import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { ai, getCompatModel } from "../../../../../lib/genkit";
import { prisma } from "../../../../../lib/prisma";
import {
  ArtifactChatRequestSchema,
  ArtifactChatResponseSchema,
  HistoryItemSchema,
} from "../../../../../lib/schemas";

const historyArraySchema = HistoryItemSchema.array();
const REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? "180000");
const MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES ?? "2");
const MAX_HISTORY_ITEMS = Number(process.env.MAX_HISTORY_ITEMS ?? "60");

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
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        const error = new Error("LLM request timeout");
        clearTimeout(timer);
        reject(error);
      }, timeout);
    });

    try {
      return (await Promise.race([
        ai.generate(payload),
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

export async function POST(req: Request) {
  let traceId = randomUUID();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    console.error("[api/artifacts/chat] Invalid JSON");
    return jsonWithTrace({ error: "Invalid JSON" }, { status: 400 }, traceId);
  }

  const parsed = ArtifactChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[api/artifacts/chat] Invalid request", parsed.error.flatten());
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

  if (!process.env.OPENAI_MODEL) {
    console.error("[api/artifacts/chat] Missing OPENAI_MODEL");
    return jsonWithTrace(
      { error: "Missing OPENAI_MODEL" },
      { status: 500 },
      traceId
    );
  }

  const { projectId, artifactId, sessionId, message } = parsed.data;
  traceId = parsed.data.traceId ?? traceId;

  try {
    const artifact = await prisma.artifact.findFirst({
      where: { id: artifactId, projectId },
      select: { id: true, prompt_content: true },
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

    let session = null;
    if (sessionId) {
      session = await prisma.artifactSession.findFirst({
        where: { id: sessionId, artifactId },
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
      model: getCompatModel(process.env.OPENAI_MODEL),
      messages: [
        { role: "system", content: [{ text: artifact.prompt_content }] },
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

    const responseBody = ArtifactChatResponseSchema.parse({
      reply,
      sessionId: session.id,
    });

    return jsonWithTrace(responseBody, undefined, traceId);
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

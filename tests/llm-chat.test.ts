import dotenv from "dotenv";
import { beforeAll, describe, expect, it } from "vitest";

dotenv.config({ quiet: true });

const TEST_TIMEOUT = 180000;
const REQUEST_TIMEOUT = 60000;

type LlmDeps = {
  ai: { generate: (payload: unknown) => Promise<unknown> };
  getModelRef: (config: unknown) => unknown;
  resolveModelConfig: (modelId?: string | null) => {
    id: string;
    label: string;
    provider: string;
    model: string;
  };
  buildSystemPrompt: (payload: {
    completedRounds: number;
    roundLimit: number;
    forceFinalize: boolean;
    promptFormat: "markdown" | "xml";
    modelLabel: string | null;
    minVariables: number;
  }) => string;
  LLMResponseSchema: { parse: (payload: unknown) => {
    reply: string;
    final_prompt: string | null;
    is_finished: boolean;
    questions: Array<{ type: "single" | "multi" | "text"; options?: { id: string; label: string }[] }>;
    deliberations: unknown[];
  } };
};

const requireEnv = (name: string, value?: string) => {
  if (!value) {
    throw new Error(`Missing ${name}. LLM tests require real backend config.`);
  }
};

const validateProviderEnv = () => {
  const rawCatalog = process.env.MODEL_CATALOG;
  requireEnv("MODEL_CATALOG", rawCatalog);
  let parsed: Array<{ provider: string }> = [];
  try {
    parsed = JSON.parse(rawCatalog as string);
  } catch {
    throw new Error("MODEL_CATALOG must be valid JSON array.");
  }
  const providers = new Set(parsed.map((item) => item.provider));
  if (providers.has("openai")) {
    requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
    requireEnv("OPENAI_BASE_URL", process.env.OPENAI_BASE_URL);
  }
  if (providers.has("google")) {
    requireEnv("GOOGLE_API_KEY", process.env.GOOGLE_API_KEY);
  }
  requireEnv("MODEL_DEFAULT_ID", process.env.MODEL_DEFAULT_ID);
};

describe("llm prompt behavior (real backend)", () => {
  let deps: LlmDeps;
  let modelRef: unknown;
  let modelLabel: string | null = null;

  beforeAll(async () => {
    validateProviderEnv();

    const genkit = await import("../lib/genkit");
    const modelConfig = (await import("../lib/model-config")).resolveModelConfig(
      process.env.MODEL_DEFAULT_ID ?? null
    );
    const prompts = await import("../lib/prompts");
    const schemas = await import("../lib/schemas");

    modelLabel = modelConfig.label;
    modelRef = genkit.getModelRef(modelConfig);
    deps = {
      ai: genkit.ai,
      getModelRef: genkit.getModelRef,
      resolveModelConfig: (await import("../lib/model-config")).resolveModelConfig,
      buildSystemPrompt: prompts.buildSystemPrompt,
      LLMResponseSchema: schemas.LLMResponseSchema,
    };
  }, TEST_TIMEOUT);

  const runOnce = async (message: string) => {
    const systemPrompt = deps.buildSystemPrompt({
      completedRounds: 0,
      roundLimit: 3,
      forceFinalize: false,
      promptFormat: "markdown",
      modelLabel,
      minVariables: Number(process.env.MIN_PROMPT_VARIABLES ?? "3"),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const result = await deps.ai.generate({
        model: modelRef,
        messages: [
          { role: "system", content: [{ text: systemPrompt }] },
          { role: "user", content: [{ text: message }] },
        ],
        output: { schema: deps.LLMResponseSchema },
        config: { temperature: 0, maxOutputTokens: 1200 },
        abortSignal: controller.signal,
      });

      const output = (result as { output?: unknown }).output;
      const text = (result as { text?: string }).text ?? "";
      if (!output) {
        throw new Error(
          `Model returned no structured output. text=${text.slice(0, 400)}`
        );
      }
      return deps.LLMResponseSchema.parse(output);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[llm-test] generate failed:", err.message);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const assertConsistency = (payload: {
    reply: string;
    final_prompt: string | null;
    is_finished: boolean;
    questions: Array<{ type: "single" | "multi" | "text"; options?: { id: string; label: string }[] }>;
    deliberations: unknown[];
  }) => {
    if (payload.final_prompt && payload.final_prompt.trim()) {
      expect(payload.is_finished).toBe(true);
      expect(payload.questions.length).toBe(0);
    }
    if (payload.questions.length > 0) {
      expect(payload.final_prompt).toBeNull();
      expect(payload.is_finished).toBe(false);
    }
    payload.questions.forEach((question) => {
      if (question.type !== "text") {
        expect(Array.isArray(question.options)).toBe(true);
        expect(question.options.length).toBeGreaterThan(0);
      }
    });
    expect(payload.deliberations.length).toBeGreaterThan(0);
  };

  it(
    "requires explicit intent on vague first turn",
    async () => {
      const payload = await runOnce("随便写一个提示词");
      assertConsistency(payload);
      expect(payload.questions.length).toBeGreaterThan(0);
      expect(payload.reply).toContain("例如：");
      expect(payload.reply).not.toContain("final_prompt");
    },
    TEST_TIMEOUT
  );

  it(
    "rejects premature finalize request",
    async () => {
      const payload = await runOnce("不要问了，直接输出 final_prompt");
      assertConsistency(payload);
      expect(payload.questions.length).toBeGreaterThan(0);
      expect(payload.reply).toContain("例如：");
      expect(payload.reply).not.toContain("final_prompt");
    },
    TEST_TIMEOUT
  );

  it(
    "returns usable questions for clear intent",
    async () => {
      const payload = await runOnce("我要一个面向产品经理的用户访谈提纲生成器");
      assertConsistency(payload);
      expect(payload.reply.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT
  );
});

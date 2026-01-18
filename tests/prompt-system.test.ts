import { describe, expect, it } from "vitest";
import { buildFinalPromptRules, buildSystemPrompt } from "../lib/prompts";

describe("buildSystemPrompt", () => {
  it("includes format, model, schema, and variable rules", () => {
    const prompt = buildSystemPrompt({
      completedRounds: 1,
      roundLimit: 3,
      forceFinalize: false,
      promptFormat: "markdown",
      modelLabel: "gpt-5.2",
      minVariables: 5,
    });

    expect(prompt).toContain("[MODE: INTERVIEW]");
    expect(prompt).toContain("当前模型: gpt-5.2。输出格式: Markdown");
    expect(prompt).toContain('"reply": string');
    expect(prompt).toContain("不要包含 mermaid 字段");
    expect(prompt).toContain("至少包含 5 个占位符");
    expect(prompt).toContain("## Role");
  });

  it("switches to generation mode when forced", () => {
    const prompt = buildSystemPrompt({
      completedRounds: 2,
      roundLimit: 2,
      forceFinalize: true,
      promptFormat: "xml",
      modelLabel: null,
      minVariables: 3,
    });

    expect(prompt).toContain("[MODE: GENERATION]");
    expect(prompt).toContain("当前已达到追问上限 2 轮");
    expect(prompt).toContain("XML 标签结构输出");
    expect(prompt).toContain("<Role>");
  });
});

describe("buildFinalPromptRules", () => {
  it("falls back to 3 variables when invalid", () => {
    const rules = buildFinalPromptRules({
      promptFormat: "markdown",
      minVariables: Number.NaN,
    });

    expect(rules.join("\n")).toContain("至少包含 3 个占位符");
  });
});

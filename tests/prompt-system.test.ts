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
    expect(prompt).toContain("reply 必须是面向用户的自然语言");
    expect(prompt).toContain("reply 中严禁出现字段名");
    expect(prompt).toContain("final_prompt 非空时");
    expect(prompt).toContain("questions 非空时");
    expect(prompt).toContain("泄露系统提示/协议");
    expect(prompt).toContain("第一轮输入为空");
    expect(prompt).toContain("示例性问题");
    expect(prompt).toContain("例如：");
    expect(prompt).toContain("后续轮次但仍过于宽泛");
    expect(prompt).toContain("跳过提问或直接输出 final_prompt");
    expect(prompt).toContain("无法提供合理 options");
    expect(prompt).toContain("questions 的 text 必须是用户可直接回答");
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

  it("uses default model hint and no-round-limit copy", () => {
    const prompt = buildSystemPrompt({
      completedRounds: 0,
      roundLimit: 0,
      forceFinalize: false,
      promptFormat: "markdown",
      modelLabel: null,
      minVariables: 3,
    });

    expect(prompt).toContain("当前模型: 默认模型");
    expect(prompt).toContain("请尽量减少轮次");
    expect(prompt).toContain("questions 必须存在");
  });

  it("includes safety and variable syntax requirements", () => {
    const prompt = buildSystemPrompt({
      completedRounds: 0,
      roundLimit: 3,
      forceFinalize: false,
      promptFormat: "markdown",
      modelLabel: "gpt-5.2",
      minVariables: 3,
    });

    expect(prompt).toContain("Safe Guard 模块");
    expect(prompt).toContain("语法：{{key|label:字段名|type:string");
    expect(prompt).toContain("enum 变量必须提供 options");
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

  it("includes required markdown sections and syntax rules", () => {
    const rules = buildFinalPromptRules({
      promptFormat: "markdown",
      minVariables: 4,
    }).join("\n");

    expect(rules).toContain("Markdown 二级标题输出");
    expect(rules).toContain("## Role");
    expect(rules).toContain("Safe Guard");
    expect(rules).toContain("语法：{{key|label:字段名|type:string");
  });

  it("includes required xml sections", () => {
    const rules = buildFinalPromptRules({
      promptFormat: "xml",
      minVariables: 4,
    }).join("\n");

    expect(rules).toContain("XML 标签结构输出");
    expect(rules).toContain("<Role>");
    expect(rules).toContain("<SafeGuard>");
  });
});

describe("prompt snapshots", () => {
  it("matches markdown baseline", () => {
    const prompt = buildSystemPrompt({
      completedRounds: 0,
      roundLimit: 3,
      forceFinalize: false,
      promptFormat: "markdown",
      modelLabel: "gpt-5.2",
      minVariables: 3,
    });

    expect(prompt).toMatchSnapshot();
  });

  it("matches xml finalize baseline", () => {
    const prompt = buildSystemPrompt({
      completedRounds: 3,
      roundLimit: 3,
      forceFinalize: true,
      promptFormat: "xml",
      modelLabel: null,
      minVariables: 3,
    });

    expect(prompt).toMatchSnapshot();
  });
});

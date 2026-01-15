# Prompt Smith 制品生成工作流审计报告 (v01)

基于对项目代码库（特别是 `src/app/api/chat/route.ts` 和 `lib/schemas.ts`）与 `@docs/**` PRD 文档的比对，识别出以下核心偏差：

## 1. 核心生成引擎 (The "Alchemy" Engine) 严重简化
*   **PRD 要求**：
    *   **并行生成**：必须并发生成 3 个变体（方案 A-结构化, 方案 B-角色化, 方案 C-推理型）。
    *   **独立裁判 (Critic)**：一个独立的 Agent 对 3 个方案进行评分（清晰度、鲁棒性、对齐度）。
    *   **融合 (Synthesis)**：基于评分融合最优解。
*   **当前实现**：
    *   **单次模拟**：在单个 System Prompt 中要求模型同时输出 `deliberations` 数组和 `final_prompt`。
    *   **逻辑缺失**：缺乏真实的并行生成逻辑，`deliberations` 字段目前仅用于模拟展示，而非真实的后端竞争评分过程。
*   **影响**：核心“炼丹”机制未完全落实，生成的 Prompt 质量受限于单次推理的广度。

## 2. 输出结构与规范未强制
*   **PRD 要求**：
    *   生成的 Prompt **必须**包含标准板块：`Role`, `Context`, `Constraints`, `Workflow`, `Examples`。
    *   支持 **Target Model** 参数，根据不同模型（如 Claude vs GPT-4）调整输出格式（XML vs Markdown）。
*   **当前实现**：
    *   **结构松散**：System Prompt 虽然强制了变量语法，但未明确要求上述 5 个核心章节。
    *   **模型适配缺失**：API 请求中缺少 `targetModel` 字段，后端无法根据目标平台进行格式优化。

---

## 修正方案 (Action Plan)

1.  **重构 System Prompt**：在指令中明确要求生成的 `final_prompt` 必须严格包含 `Role`, `Context`, `Constraints`, `Workflow`, `Examples` 章节。
2.  **强化“竞争性”指令**：修改 `src/app/api/chat/route.ts` 的系统指令，强制模型在输出最终制品前，在 `deliberations` 内部显式按照 A/B/C 三种视角进行推演与自我评估，以模拟多 Agent 竞争效果。
3.  **引入 Target Model 适配**：
    *   更新 `lib/schemas.ts` 中的 `ChatRequestSchema` 以包含 `targetModel` 字段。
    *   在后端逻辑中根据该参数注入特定的格式化指令（如 XML 约束）。

---

## 默认 Prompt 优化建议 (Default Prompt Optimization)

基于对 `src/app/api/chat/route.ts` 中当前 System Prompt 的分析，提出以下具体优化意见：

### 1. 结构化输出指令 (Structural Enforcement)
*   **当前问题**：仅泛泛要求“制品模板”，未强制标准章节，导致输出结构松散。
*   **修改意见**：在 Prompt 中明确：“final_prompt 必须包含以下 Markdown 二级标题：`### Role`, `### Context`, `### Constraints`, `### Workflow`, `### Examples (Few-Shot)`, `### Initialization (Defensive)`。”

### 2. 竞争性思考细化 (Deliberation Specification)
*   **当前问题**：`deliberations` 指令过于宽泛，导致模型生成的思考过程缺乏深度或仅为形式。
*   **修改意见**：明确指定 Agent 角色。例如：“在 deliberations 中，必须模拟三个特定 Agent 的视角：**Architect (逻辑架构)**、**Role-Player (人设沉浸)**、**Logician (边界与CoT)**，并给出具体评分。”

### 3. 防御性指令强制 (Defensive Instructions)
*   **当前问题**：Prompt 中未强制要求生成结果包含防止越狱或幻觉的指令。
*   **修改意见**：明确要求：“final_prompt 必须包含 'Safe Guard' 模块，明确指示 AI 拒绝非法请求，并强制开启 <thinking> 思考过程。”

### 4. 变量定义场景引导 (Variable Context)
*   **当前问题**：侧重语法格式，忽略了变量的业务价值。
*   **修改意见**：增加引导：“优先识别决定 Prompt 走向的关键控制参数（如：风格语气、受众群体、输出格式约束），而不仅仅是名词替换。”

---

## 多 Agent 评分机制开发指导 (Multi-Agent Deliberation Logic)

针对代码中缺乏确定性 Agent 调度逻辑的问题，建议进行以下开发重构：

### 1. 动态 Agent 注入策略
目前 `buildSystemPrompt` 是静态文本拼接，建议根据对话状态（`is_finished` 或 `completedRounds`）动态注入不同的 Agent 指令。

*   **阶段一：需求收集 (Phase: Collection)**
    *   **触发条件**：`!forceFinalize` 且 `questions.length > 0`
    *   **Agent 角色**：
        *   `Questioner` (追问者)：负责挖掘模糊点。
        *   `LogicAnalyzer` (逻辑分析员)：负责分析用户意图的完备性。
    *   **指令片段**：
        > "Current Task: Interview & Intent Analysis.
        > Use 'Questioner' agent to ask the next key question.
        > Use 'LogicAnalyzer' agent to identify logical gaps in user's request."

*   **阶段二：最终生成 (Phase: Generation)**
    *   **触发条件**：`forceFinalize` 或模型判定信息收集完毕。
    *   **Agent 角色**：
        *   `Architect` (架构师)：评分维度 [Structure, Logic]
        *   `RolePlayer` (角色扮演)：评分维度 [Immersion, Tone]
        *   `Critic` (裁判)：评分维度 [Safety, Robustness]
    *   **指令片段**：
        > "Current Task: Synthesis & Evaluation.
        > YOU MUST SIMULATE A DEBATE between [Architect, RolePlayer, Critic].
        > Each agent must criticize the draft prompt and provide a score (0-10).
        > Synthesis logic: Combine the best parts of all agents' feedback into the 'final_prompt'."

### 2. 实现建议
修改 `src/app/api/chat/route.ts` 中的 `buildSystemPrompt` 函数：

```typescript
// 伪代码示例
const buildSystemPrompt = ({ forceFinalize, ... }) => {
  let modeInstructions = "";

  if (forceFinalize) {
    modeInstructions = `
      [MODE: GENERATION]
      You are now in the Final Synthesis Phase.
      DELIBERATION REQUIRED:
      1. Agent 'Architect': Evaluate structure (Markdown headers, logic flow).
      2. Agent 'RolePlayer': Evaluate persona depth and voice.
      3. Agent 'Critic': Evaluate safety constraints and variable flexibility.
      Output the final result in 'final_prompt' only after this internal debate.
    `;
  } else {
    modeInstructions = `
      [MODE: INTERVIEW]
      You are now in the Information Gathering Phase.
      DELIBERATION REQUIRED:
      1. Agent 'Guide': Determine what information is missing.
      2. Agent 'LogicAnalyzer': Analyze the coherence of user's requirements.
      Output 'questions' array to proceed.
    `;
  }

  return [
    "...",
    modeInstructions,
    "..."
  ].join("\n");
};
```

---

## 执行状态

- 已完成：并行炼丹引擎（A/B/C + Critic + Synthesis）、动态 Agent 阶段、targetModel 前端入口、Safe Guard/<thinking> 结构校验。
- 端到端验证：新对话启动、目标模型切换（Claude XML）、问卷生成流程可用且无报错。

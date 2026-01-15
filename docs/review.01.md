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

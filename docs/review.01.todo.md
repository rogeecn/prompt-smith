# Prompt Smith 审计 TODO Checklist

基于 `docs/review.01.md` 的要求整理，完成一项就打勾。

- [x] System Prompt 强制结构化章节（Role/Context/Constraints/Workflow/Examples/Initialization/Safe Guard）
- [x] deliberations 竞争性指令（A/B/C 视角 + Architect/Role-Player/Logician 评分）
- [x] ChatRequestSchema 增加 targetModel + 后端格式适配（XML/Markdown）
- [x] Safe Guard 模块要求 + <thinking> 思考提示
- [x] 变量关键控制参数引导（风格/受众/格式/约束）
- [x] 并行生成 3 变体 + 独立 Critic 评分 + Synthesis 融合
- [x] 动态 Agent 注入（收集阶段 Questioner/Planner；生成阶段 Architect/RolePlayer/Critic）
- [x] targetModel 前端入口（非 URL 参数）
- [x] Safe Guard/<thinking> 结构校验在 Guard 中硬性检查
- [x] 端到端验证 + docs/review.01.md 状态更新

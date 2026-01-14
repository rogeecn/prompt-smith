# Prompt Smith 优化与演进路线图

本文档基于对 MVP 版本的代码审计，结合“去线性化”与“论坛式（Thread-style）”的 UI 设计目标，规划了后续的优化方案。

## 1. UI/UX 视觉升级：色块与全宽布局 (Visual Polish)

**核心理念**：摒弃传统“聊天气泡”与“左右对齐”的形式。采用**全宽论坛贴（Forum Post）**风格，最大化信息展示空间。通过**背景色块（Color Blocks）**而非线框来区分不同角色的内容。

### A. 消息流布局 (Message Stream Layout)
- [ ] **全宽堆叠 (Full Width Stacking)**：
  - 移除左右分侧布局。所有消息（User/AI）均为全宽 (`w-full`) 垂直堆叠。
  - 增加单条消息的内部内边距 (`p-6` 或 `p-8`)，提供类似文档阅读的舒适感。
- [ ] **角色色块区分 (Role-based Color Coding)**：
  - **User (用户)**：使用浅灰色块（如 `bg-slate-50` 或 `bg-slate-100/50`），强调“提问/指令”的区块感。
  - **AI (助手)**：使用纯白背景 (`bg-white`)，突出“内容/回复”的主体地位。
  - **System/Deliberation (思考/系统)**：使用独立的语义色块（如 `bg-indigo-50/50` 或 `bg-amber-50/50`），用于展示 Agent 评分、表单请求等元信息。

### B. 全局色彩与层级系统
- [ ] **配色升级**：引入语义化主色（推荐 Indigo/Violet），替代单一的 Slate 灰。
  - 定义 `Primary` (主操作), `Surface` (底色), `Muted` (弱化信息)。
- [ ] **岛屿式布局 (Island Layout)**：
  - **Sidebar**：改为半透明浅色背景，独立悬浮，与内容区保持间距。
  - **Main Area**：取消大区域边框，利用背景色差区分侧边栏与主内容区。

### C. 列表与微交互
- [ ] **列表去线化**：
  - 移除历史记录列表中的 `divide-y` 线条。
  - 列表项采用“整体填充”交互：Hover 时填充浅色块，选中时使用高亮色块。
- [ ] **加载状态优化**：
  - 替换简单的“Typing dot”，使用全宽的骨架屏或渐进式状态描述。

### D. 移动端适配
- [ ] **抽屉式导航 (Drawer)**：
  - 移动端隐藏侧边栏，改为顶部 Header + 汉堡菜单。
  - 点击菜单从左侧滑出 Drawer。

## 2. 代码架构重构 (Refactoring)

### A. 拆分 God Component (`ChatInterface`)
`ChatInterface.tsx` 当前集成了过多职责，需拆解为：
- [ ] **`components/chat/MessageStream.tsx`**：负责全宽消息流的整体渲染容器。
- [ ] **`components/chat/MessageBlock.tsx`**：单条消息区块组件，处理不同 Role 的样式逻辑。
- [ ] **`components/chat/QuestionForm.tsx`**：专注于动态问卷表单的渲染、交互与校验。
- [ ] **`components/chat/AgentDeliberation.tsx`**：专门展示 Agent 思考过程的区块。
- [ ] **`hooks/useChatSession.ts`**：抽离消息管理、API 请求等逻辑。

### B. 数据层健壮性
- [ ] **JSON 容错处理**：在 API 层增加清洗逻辑，防止 LLM 返回非标准格式。
- [ ] **保存机制优化**：使用更可靠的持久化方式处理草稿保存。

## 3. 功能增强 (Features)

### A. 交互体验
- [ ] **流式/阶段性反馈**：根据后端返回的 `deliberations` 数组逐步展示思考过程，而非等待全部完成后闪现。

### B. 安全与扩展
- [ ] **Prompt 注入防护**：在 Guard 阶段加强安全校验。

## 4. 待办执行清单 (Action Items)

1. **样式基建**：配置 Tailwind 定义色彩系统。
2. **布局调整**：重写 `src/app/page.tsx` 实现“岛屿”布局与全宽消息容器。
3. **组件重构**：按论坛风格重写 `ChatInterface` 渲染逻辑。
4. **细节打磨**：调整间距、圆角与阴影。

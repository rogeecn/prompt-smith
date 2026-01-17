# Prompt Smith

Prompt Smith 是一个面向产品与运营场景的提示词生产工具。
核心能力是通过结构化对话快速生成高质量 Prompt，并将其沉淀为可复用的制品模板。

## 功能概览

- 对话式引导，按问题树收集需求
- 多 Agent 评分与融合，输出更稳定的 Prompt
- 制品库管理：创建、编辑、导入、对话使用
- 变量占位符语法，支持自动生成表单
- 会话管理：历史对话与新对话隔离
- 账号管理：修改密码、无邮件找回

## 本地开发

### 1) 环境准备

- Node.js 18+ (建议 20+)
- SQLite（默认，单文件部署）

### 2) 安装依赖

```bash
npm install
```

### 3) 环境变量

在项目根目录创建 `.env`，至少包含以下内容：

```bash
DATABASE_URL="file:./dev.db"
AUTH_SECRET="YOUR_RANDOM_SECRET"
OPENAI_API_KEY="YOUR_KEY"
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4o-mini"
```

如需启用多模型配置（前端模型列表来自后端配置），使用 `OPENAI_MODELS`：

```bash
OPENAI_MODELS='[
  {"id":"gpt-4o-mini","label":"GPT-4o mini","model":"gpt-4o-mini"},
  {"id":"gpt-4o","label":"GPT-4o","model":"gpt-4o"}
]'
OPENAI_DEFAULT_MODEL_ID="gpt-4o-mini"
```

说明：
- `OPENAI_MODEL` 与 `OPENAI_MODELS` 二选一即可（推荐后者）。
- `id` 用于前端选择；`model` 为实际请求模型；`label` 为展示文案。
- `AUTH_SECRET` 用于签发登录会话，必须设置。

可选配置：

```bash
OPENAI_TIMEOUT_MS="180000"
OPENAI_MAX_RETRIES="2"
MAX_HISTORY_ITEMS="60"
MAX_QUESTION_ROUNDS="3"
MIN_PROMPT_VARIABLES="3"
PASSWORD_RESET_TTL_MS="1800000"
```

### 4) 初始化数据库

```bash
npx prisma migrate dev
```

### 5) 启动开发服务

```bash
npm run dev
```

默认监听 `0.0.0.0:3000`，可通过局域网访问：

```
http://<你的内网IP>:3000/
```

## 使用说明

### 登录与项目管理

1. 访问 `/login` 或 `/register` 完成登录/注册。
2. 登录后进入项目列表 `/`，点击“新建项目”创建项目。
3. 选择项目进入向导 `/project/[projectId]` 或制品库 `/artifacts?projectId=...`。

### 账号与密码

- 登录后可在 `/account` 修改密码。
- 忘记密码：访问 `/forgot-password` 生成一次性重置令牌（无邮件服务时直接展示），再到 `/reset-password` 输入令牌与新密码完成重置。
- 令牌仅会在页面展示，请及时保存；生产环境可自行接入邮件发送。

### 生成 (对话生成 Prompt)

1. 进入项目向导 `/project/[projectId]`。
2. 在左侧完成问答或输入补充内容。
3. 生成完成后可复制最终 Prompt。
4. 可将最终 Prompt 导出为制品。

### 制品 (模板化复用)

1. 进入 `/artifacts?projectId=...` 制品列表。
2. 新建/导入制品后，可编辑标题、问题、模板内容与变量配置。
3. 进入制品详情页，配置变量后点击“开始生成”。
4. 生成后进入对话精修流程，可多轮对话。

### 变量占位符语法

制品模板支持结构化变量，占位符示例：

```
{{topic|label:主题|type:string|default:职场穿搭|placeholder:例如 通勤/面试|required:true}}
```

完整规范见 `docs/template-variable-syntax.md`。

## 部署

### 生产构建

```bash
npm run build
```

### 启动生产服务

```bash
npm run start
```

### 生产环境建议

- SQLite 适合轻量部署；若需要多实例并发或高可用，可切换到 PostgreSQL
- 确保 `DATABASE_URL` 指向生产库/生产文件
- 通过反向代理暴露 3000 端口
- 推荐配置日志采集与监控

## 常用命令

```bash
npm run dev    # 本地开发
npm run build  # 生产构建
npm run start  # 生产运行
npm run lint   # ESLint 检查
```

## 目录结构

```
src/app/        # Next.js App Router
components/     # 前端组件
lib/            # Zod/Prisma/模板工具
prisma/         # Prisma schema
public/         # 静态资源
```

## 说明

- OpenAI 兼容接口必须配置 `OPENAI_BASE_URL`，并提供 `OPENAI_MODEL` 或 `OPENAI_MODELS`
- 模型选择与输出格式在 UI 中独立配置
- 如果出现跨域开发警告，确认 `next.config.ts` 中的 `allowedDevOrigins`

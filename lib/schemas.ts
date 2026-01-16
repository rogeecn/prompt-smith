import { z } from "zod";

export const QuestionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const QuestionSchema = z.object({
  id: z.string().min(1).optional(),
  step: z.string().min(1).optional(),
  text: z.string().min(1),
  type: z.enum(["single", "multi", "text"]),
  options: z.array(QuestionOptionSchema).optional(),
  allow_other: z.boolean().optional(),
  allow_none: z.boolean().optional(),
  max_select: z.number().int().positive().optional(),
  placeholder: z.string().min(1).optional(),
  input_mode: z.enum(["input", "textarea"]).optional(),
}).superRefine((value, ctx) => {
  if (value.type === "text") {
    if (value.options && value.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "text 类型不允许 options",
        path: ["options"],
      });
    }
    if (value.max_select !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "text 类型不允许 max_select",
        path: ["max_select"],
      });
    }
    return;
  }

  if (!value.options || value.options.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "single/multi 必须提供 options",
      path: ["options"],
    });
  }

  if (value.type !== "multi" && value.max_select !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "仅 multi 可设置 max_select",
      path: ["max_select"],
    });
  }
});

export type Question = z.infer<typeof QuestionSchema>;

export const AnswerSchema = z.object({
  question_id: z.string().min(1).optional(),
  type: z.enum(["single", "multi", "text"]),
  value: z.union([z.string().min(1), z.array(z.string().min(1))]),
  other: z.string().min(1).optional(),
});

export type Answer = z.infer<typeof AnswerSchema>;

export const DraftAnswerSchema = z.object({
  type: z.enum(["single", "multi", "text"]),
  value: z.union([z.string(), z.array(z.string())]),
  other: z.string().optional(),
});

export type DraftAnswer = z.infer<typeof DraftAnswerSchema>;

export const DraftAnswerRecordSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const record = value as Record<string, unknown>;
    const next: Record<string, DraftAnswer> = {};

    Object.entries(record).forEach(([key, entry]) => {
      const parsed = DraftAnswerSchema.safeParse(entry);
      if (parsed.success) {
        next[key] = parsed.data;
      }
    });

    return next;
  },
  z.record(z.string(), DraftAnswerSchema).default({})
);

export const OutputFormatSchema = z.enum(["markdown", "xml"]);

export type OutputFormat = z.infer<typeof OutputFormatSchema>;

export const ChatRequestSchema = z
  .object({
    projectId: z.string().uuid(),
    sessionId: z.string().min(1),
    message: z.string().min(1).max(12000).optional(),
    answers: z.array(AnswerSchema).max(40).optional(),
    traceId: z.string().min(1).optional(),
    modelId: z.string().min(1).optional(),
    outputFormat: OutputFormatSchema.optional(),
    targetModel: z.string().min(1).optional(),
  })
  .refine(
    (data) => Boolean(data.message) || (data.answers?.length ?? 0) > 0,
    { message: "message or answers required" }
  );

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

const DeliberationScoreSchema = z.preprocess(
  (value) => {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return value;
      }
      return Math.max(0, Math.min(10, value));
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return value;
      }
      return Math.max(0, Math.min(10, parsed));
    }
    return value;
  },
  z.number().min(0).max(10)
);

export const DeliberationAgentSchema = z.object({
  name: z.string().min(1),
  stance: z.string().min(1),
  score: DeliberationScoreSchema,
  rationale: z.string().min(1),
});

export const DeliberationStageSchema = z.object({
  stage: z.string().min(1),
  agents: z.array(DeliberationAgentSchema),
  synthesis: z.string().min(1),
});

export const SessionStateSchema = z.object({
  questions: z.array(QuestionSchema).default([]),
  deliberations: z.array(DeliberationStageSchema).default([]),
  final_prompt: z.string().nullable().default(null),
  is_finished: z.boolean().default(false),
  target_model: z.string().nullable().default(null),
  model_id: z.string().nullable().default(null),
  output_format: OutputFormatSchema.nullable().default(null),
  title: z.string().nullable().default(null),
  draft_answers: DraftAnswerRecordSchema,
});

export type SessionState = z.infer<typeof SessionStateSchema>;

export const ModelOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const ModelCatalogSchema = z.object({
  models: z.array(ModelOptionSchema).min(1),
  defaultModelId: z.string().min(1),
  formats: z.array(OutputFormatSchema).min(1),
  defaultFormat: OutputFormatSchema,
});

export type ModelCatalog = z.infer<typeof ModelCatalogSchema>;

export const LLMResponseSchema = z.object({
  reply: z.string(),
  final_prompt: z.string().nullable(),
  is_finished: z.boolean(),
  questions: z.array(QuestionSchema).default([]),
  deliberations: z.array(DeliberationStageSchema).min(1).default([]),
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;

export const GuardPromptReviewSchema = z.object({
  pass: z.boolean(),
  issues: z.array(z.string()).default([]),
  revised_prompt: z.string().nullable().default(null),
  variables: z.array(z.string()).default([]),
});

export type GuardPromptReview = z.infer<typeof GuardPromptReviewSchema>;

export const HistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.number(),
});

export type HistoryItem = z.infer<typeof HistoryItemSchema>;

const VariableKeySchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/, "变量名必须为英文字母或下划线");

export const ArtifactVariableSchema = z
  .object({
    key: VariableKeySchema,
    label: z.string().min(1),
    type: z.enum(["string", "text", "number", "boolean", "enum", "list"]),
    required: z.boolean().optional(),
    placeholder: z.string().optional(),
    default: z
      .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
      .optional(),
    options: z.array(z.string().min(1)).optional(),
    joiner: z.string().optional(),
    true_label: z.string().optional(),
    false_label: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "enum" && (!value.options || value.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "enum 类型必须提供 options",
        path: ["options"],
      });
    }
  });

export const ArtifactVariablesSchema = z.array(ArtifactVariableSchema).default([]);

export type ArtifactVariable = z.infer<typeof ArtifactVariableSchema>;

export const ArtifactSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  problem: z.string().min(1),
  prompt_content: z.string().min(1),
  variables: ArtifactVariablesSchema.default([]),
});

export type Artifact = z.infer<typeof ArtifactSchema>;

export const ArtifactUpdateSchema = z.object({
  title: z.string().min(1),
  problem: z.string().min(1),
  prompt_content: z.string().min(1),
  variables: ArtifactVariablesSchema.optional(),
});

export type ArtifactUpdate = z.infer<typeof ArtifactUpdateSchema>;

const ArtifactInputValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const ArtifactChatRequestSchema = z.object({
  projectId: z.string().uuid(),
  artifactId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  message: z.string().min(1).max(4000),
  traceId: z.string().min(1).optional(),
  inputs: z.record(z.string(), ArtifactInputValueSchema).optional(),
});

export type ArtifactChatRequest = z.infer<typeof ArtifactChatRequestSchema>;

export const ArtifactChatResponseSchema = z.object({
  reply: z.string().min(1),
  sessionId: z.string().min(1),
});

export type ArtifactChatResponse = z.infer<typeof ArtifactChatResponseSchema>;

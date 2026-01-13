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
  z.record(DraftAnswerSchema).default({})
);

export const ChatRequestSchema = z
  .object({
    projectId: z.string().uuid(),
    sessionId: z.string().min(1),
    message: z.string().min(1).max(2000).optional(),
    answers: z.array(AnswerSchema).max(40).optional(),
    traceId: z.string().min(1).optional(),
  })
  .refine(
    (data) => Boolean(data.message) || (data.answers?.length ?? 0) > 0,
    { message: "message or answers required" }
  );

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const DeliberationAgentSchema = z.object({
  name: z.string().min(1),
  stance: z.string().min(1),
  score: z.number().min(0).max(10),
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
  draft_answers: DraftAnswerRecordSchema,
});

export type SessionState = z.infer<typeof SessionStateSchema>;

export const LLMResponseSchema = z.object({
  reply: z.string(),
  final_prompt: z.string().nullable(),
  is_finished: z.boolean(),
  questions: z.array(QuestionSchema).default([]),
  deliberations: z.array(DeliberationStageSchema).min(1).default([]),
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;

export const HistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.number(),
});

export type HistoryItem = z.infer<typeof HistoryItemSchema>;

export const ArtifactSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  problem: z.string().min(1),
  prompt_content: z.string().min(1),
});

export type Artifact = z.infer<typeof ArtifactSchema>;

export const ArtifactUpdateSchema = z.object({
  title: z.string().min(1),
  problem: z.string().min(1),
  prompt_content: z.string().min(1),
});

export type ArtifactUpdate = z.infer<typeof ArtifactUpdateSchema>;

export const ArtifactChatRequestSchema = z.object({
  projectId: z.string().uuid(),
  artifactId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  message: z.string().min(1).max(4000),
  traceId: z.string().min(1).optional(),
});

export type ArtifactChatRequest = z.infer<typeof ArtifactChatRequestSchema>;

export const ArtifactChatResponseSchema = z.object({
  reply: z.string().min(1),
  sessionId: z.string().min(1),
});

export type ArtifactChatResponse = z.infer<typeof ArtifactChatResponseSchema>;

import { z } from "zod";

const ModelProviderSchema = z.enum(["openai", "google"]);

const ModelConfigSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  model: z.string().min(1),
  provider: ModelProviderSchema.optional().default("openai"),
});

const ModelConfigListSchema = z.array(ModelConfigSchema).min(1);

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

const parseModelList = (raw?: string) => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    const result = ModelConfigListSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

const parseLegacyModelList = (raw?: string) => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    const legacy = z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          model: z.string().min(1),
        })
      )
      .min(1)
      .safeParse(parsed);
    if (!legacy.success) {
      return null;
    }
    return legacy.data.map((item) => ({ ...item, provider: "openai" as const }));
  } catch {
    return null;
  }
};

const buildFallbackList = () => {
  const fallback = process.env.OPENAI_MODEL?.trim();
  if (!fallback) {
    return null;
  }
  return [
    {
      id: fallback,
      label: fallback,
      model: fallback,
      provider: "openai" as const,
    },
  ];
};

export const getModelCatalog = () => {
  const models =
    parseModelList(process.env.MODEL_CATALOG) ??
    parseLegacyModelList(process.env.OPENAI_MODELS) ??
    buildFallbackList();
  if (!models) {
    throw new Error("Missing MODEL_CATALOG or OPENAI_MODEL/OPENAI_MODELS");
  }
  const defaultId =
    process.env.MODEL_DEFAULT_ID?.trim() ??
    process.env.OPENAI_DEFAULT_MODEL_ID?.trim() ??
    models[0].id;
  const defaultModelId = models.some((model) => model.id === defaultId)
    ? defaultId
    : models[0].id;
  return { models, defaultModelId };
};

export const resolveModelConfig = (modelId?: string | null) => {
  const { models, defaultModelId } = getModelCatalog();
  const candidate = modelId
    ? models.find((model) => model.id === modelId) ??
      models.find((model) => model.model === modelId)
    : null;
  return (
    candidate ??
    models.find((model) => model.id === defaultModelId) ??
    models[0]
  );
};

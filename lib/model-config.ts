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

export const getModelCatalog = () => {
  const models = parseModelList(process.env.MODEL_CATALOG);
  if (!models) {
    throw new Error("Missing MODEL_CATALOG");
  }
  const defaultId = process.env.MODEL_DEFAULT_ID?.trim() ?? models[0].id;
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

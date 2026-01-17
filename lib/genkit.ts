import { genkit } from "genkit";
import { compatOaiModelRef, openAICompatible } from "@genkit-ai/compat-oai";
import { googleAI } from "@genkit-ai/googleai";
import type { ModelConfig } from "./model-config";

const openaiNamespace = "openai-compat";
const googleNamespace = "googleai";

const hasGoogleKey = Boolean(process.env.GOOGLE_API_KEY);

const googlePlugin = hasGoogleKey
  ? googleAI({ apiKey: process.env.GOOGLE_API_KEY ?? "" })
  : null;

export const ai = genkit({
  plugins: [
    openAICompatible({
      name: openaiNamespace,
      apiKey: process.env.OPENAI_API_KEY ?? "",
      baseURL: process.env.OPENAI_BASE_URL,
    }),
    ...(googlePlugin ? [googlePlugin] : []),
  ],
});

export const getModelRef = (config: ModelConfig) => {
  if (!config?.model) {
    throw new Error("Missing model");
  }

  if (config.provider === "google") {
    if (!googlePlugin) {
      throw new Error("Missing GOOGLE_API_KEY");
    }
    return googlePlugin.model(config.model);
  }

  return compatOaiModelRef({
    name: config.model,
    namespace: openaiNamespace,
  });
};

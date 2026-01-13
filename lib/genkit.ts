import { genkit } from "genkit";
import { compatOaiModelRef, openAICompatible } from "@genkit-ai/compat-oai";

const pluginName = "openai-compat";

export const ai = genkit({
  plugins: [
    openAICompatible({
      name: pluginName,
      apiKey: process.env.OPENAI_API_KEY ?? "",
      baseURL: process.env.OPENAI_BASE_URL,
    }),
  ],
});

export const getCompatModel = (modelName: string) => {
  if (!modelName) {
    throw new Error("Missing OPENAI_MODEL");
  }

  return compatOaiModelRef({
    name: modelName,
    namespace: pluginName,
  });
};

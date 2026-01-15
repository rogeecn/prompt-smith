import { NextResponse } from "next/server";
import { getModelCatalog } from "../../../../lib/model-config";

const OUTPUT_FORMATS = ["markdown", "xml"] as const;

export async function GET() {
  try {
    const { models, defaultModelId } = getModelCatalog();
    return NextResponse.json({
      models: models.map((model) => ({ id: model.id, label: model.label })),
      defaultModelId,
      formats: OUTPUT_FORMATS,
      defaultFormat: OUTPUT_FORMATS[0],
    });
  } catch (error) {
    console.error("[api/models] Missing OPENAI_MODELS or OPENAI_MODEL", {
      error,
    });
    return NextResponse.json(
      { error: "Missing OPENAI_MODELS or OPENAI_MODEL" },
      { status: 500 }
    );
  }
}

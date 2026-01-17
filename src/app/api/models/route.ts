import { NextResponse } from "next/server";
import { getModelCatalog } from "../../../../lib/model-config";
import { getSession } from "../../../lib/auth";

const OUTPUT_FORMATS = ["markdown", "xml"] as const;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { models, defaultModelId } = getModelCatalog();
    return NextResponse.json({
      models: models.map((model) => ({ id: model.id, label: model.label })),
      defaultModelId,
      formats: OUTPUT_FORMATS,
      defaultFormat: OUTPUT_FORMATS[0],
    });
  } catch (error) {
    console.error("[api/models] Missing MODEL_CATALOG", {
      error,
    });
    return NextResponse.json(
      { error: "Missing MODEL_CATALOG" },
      { status: 500 }
    );
  }
}

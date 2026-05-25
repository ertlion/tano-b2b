import { NextResponse } from "next/server";
import { SCENES, MODELS, ANGLES } from "@/lib/image-presets";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      scenes: SCENES.map((p) => ({ id: p.id, label: p.label })),
      models: MODELS.map((p) => ({ id: p.id, label: p.label })),
      angles: ANGLES.map((p) => ({ id: p.id, label: p.label })),
    },
  });
}

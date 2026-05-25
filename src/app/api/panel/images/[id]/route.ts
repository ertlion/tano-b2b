import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generatedImages } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Görseli sil (soft delete)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = await requireAuth(request);
    const { id } = await params;
    const imageId = parseInt(id);
    if (isNaN(imageId)) return NextResponse.json({ error: "Geçersiz ID" }, { status: 400 });

    await db
      .update(generatedImages)
      .set({ isActive: false })
      .where(and(eq(generatedImages.id, imageId), eq(generatedImages.tenantId, tenantId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[PANEL/IMAGES/:id] DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

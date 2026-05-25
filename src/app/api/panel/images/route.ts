import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generatedImages } from "@/lib/schema";
import { and, eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Üyenin ürettiği görseller (opsiyonel masterProductId filtresi)
export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const pid = request.nextUrl.searchParams.get("masterProductId");
    const conds = [eq(generatedImages.tenantId, tenantId), eq(generatedImages.isActive, true)];
    if (pid) conds.push(eq(generatedImages.masterProductId, Number(pid)));

    const rows = await db.query.generatedImages.findMany({
      where: and(...conds),
      orderBy: [asc(generatedImages.sortOrder), asc(generatedImages.id)],
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[PANEL/IMAGES] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// Sıralama güncelle: { order: [imageId, ...] }
export async function PUT(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const body = await request.json();
    const order: number[] = Array.isArray(body.order) ? body.order : [];
    for (let i = 0; i < order.length; i++) {
      await db
        .update(generatedImages)
        .set({ sortOrder: i })
        .where(and(eq(generatedImages.id, order[i]), eq(generatedImages.tenantId, tenantId)));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[PANEL/IMAGES] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

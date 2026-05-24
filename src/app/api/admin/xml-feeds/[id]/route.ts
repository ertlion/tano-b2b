import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { xmlFeeds } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { importFromUrl } from "@/lib/xml-import";
import { syncAllTenantsStock } from "@/lib/sync-engine";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin(request);
    const id = Number(params.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Geçersiz id" }, { status: 400 });

    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.name === "string") updates.name = body.name.trim();
    if (typeof body.url === "string") {
      try {
        new URL(body.url);
      } catch {
        return NextResponse.json({ error: "Geçersiz URL" }, { status: 400 });
      }
      updates.url = body.url.trim();
    }
    if (typeof body.intervalMinutes === "number") {
      updates.intervalMinutes = Math.max(5, Math.min(1440, body.intervalMinutes));
    }
    if (typeof body.isActive === "boolean") updates.isActive = body.isActive;

    const [updated] = await db
      .update(xmlFeeds)
      .set(updates)
      .where(eq(xmlFeeds.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: "Feed bulunamadı" }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[XML-FEEDS/PATCH]:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin(request);
    const id = Number(params.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Geçersiz id" }, { status: 400 });

    await db.delete(xmlFeeds).where(eq(xmlFeeds.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[XML-FEEDS/DELETE]:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// Manuel "şimdi çalıştır" — admin panelden tek tık ile import
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin(request);
    const id = Number(params.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Geçersiz id" }, { status: 400 });

    const feed = await db.query.xmlFeeds.findFirst({ where: eq(xmlFeeds.id, id) });
    if (!feed) return NextResponse.json({ error: "Feed bulunamadı" }, { status: 404 });

    const result = await importFromUrl(feed.url);

    await db
      .update(xmlFeeds)
      .set({
        lastRunAt: new Date(),
        lastRunStatus: result.errors.length === 0 ? "success" : result.totalVariants > 0 ? "partial" : "error",
        lastRunSummary: {
          newProducts: result.newProducts,
          updatedProducts: result.updatedProducts,
          totalVariants: result.totalVariants,
          stockChangesCount: result.stockChanges.length,
          errorCount: result.errors.length,
          firstErrors: result.errors.slice(0, 5),
        },
        updatedAt: new Date(),
      })
      .where(eq(xmlFeeds.id, id));

    // Stok senkronu fire-and-forget
    if (result.stockChanges.length > 0) {
      syncAllTenantsStock().catch((err) => console.error("[XML-FEEDS] Sync err:", err));
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[XML-FEEDS/POST]:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

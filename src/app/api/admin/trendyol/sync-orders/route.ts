import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fetchTrendyolOrders, getTrendyolConfig } from "@/lib/trendyol-orders";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const tenantId = body.tenantId;

    if (!tenantId || typeof tenantId !== "number") {
      return NextResponse.json(
        { error: "tenantId (number) gerekli" },
        { status: 400 }
      );
    }

    const config = await getTrendyolConfig(tenantId);

    if (!config) {
      return NextResponse.json(
        { error: "Trendyol ayarlari bulunamadi. Lutfen API bilgilerini girin." },
        { status: 400 }
      );
    }

    const result = await fetchTrendyolOrders(tenantId, config);

    return NextResponse.json({
      success: true,
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[TRENDYOL-SYNC] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bilinmeyen hata" },
      { status: 500 }
    );
  }
}

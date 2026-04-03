import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { pushProductToTenant } from "@/lib/sync-engine";
import type { MarketplaceName } from "@/lib/marketplace/types";

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const body = await request.json();
    const { masterProductId, categoryMapping } = body;

    if (!masterProductId || typeof masterProductId !== "number") {
      return NextResponse.json(
        { error: "masterProductId (number) zorunlu" },
        { status: 400 }
      );
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { id: true, marketplace: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Bayi bulunamadi" }, { status: 404 });
    }

    if (!tenant.marketplace) {
      return NextResponse.json(
        { error: "Marketplace bilgisi tanimli degil" },
        { status: 400 }
      );
    }

    const result = await pushProductToTenant(
      tenantId,
      tenant.marketplace as MarketplaceName,
      masterProductId,
      categoryMapping || undefined
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Ürün aktarılamadı" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/PRODUCTS/push] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

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

    // Support both formats:
    // 1. { masterProductId: number } — single product
    // 2. { productIds: number[], variantIds?: number[] } — from new products page
    let productIds: number[] = [];

    if (body.masterProductId && typeof body.masterProductId === "number") {
      productIds = [body.masterProductId];
    } else if (Array.isArray(body.productIds) && body.productIds.length > 0) {
      productIds = body.productIds.filter((id: unknown) => typeof id === "number");
    }

    if (productIds.length === 0) {
      return NextResponse.json(
        { error: "En az bir ürün seçilmeli" },
        { status: 400 }
      );
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { id: true, marketplace: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Bayi bulunamadı" }, { status: 404 });
    }

    if (!tenant.marketplace) {
      return NextResponse.json(
        { error: "Marketplace bilgisi tanımlı değil" },
        { status: 400 }
      );
    }

    const results = [];
    const errors = [];

    for (const productId of productIds) {
      try {
        const result = await pushProductToTenant(
          tenantId,
          tenant.marketplace as MarketplaceName,
          productId,
          body.categoryMapping || undefined
        );
        if (result.success) {
          results.push({ productId, success: true });
        } else {
          errors.push({ productId, error: result.error || "Aktarılamadı" });
        }
      } catch (err) {
        errors.push({
          productId,
          error: err instanceof Error ? err.message : "Bilinmeyen hata",
        });
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return NextResponse.json(
        { error: errors.map((e) => e.error).join(", "), details: errors },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        pushed: results.length,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
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

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  tenants,
  masterProducts,
  masterVariants,
  tenantProductPermissions,
  tenantVariantPrices,
} from "@/lib/schema";
import { eq, and, ilike, or, inArray, sql, asc } from "drizzle-orm";
import { getTenantVariantPrices, getUsdTryRate } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// İzin verilen master product id'lerini çöz (yoksa tüm aktif ürünler).
async function allowedProductIds(tenantId: number): Promise<number[] | null> {
  const perms = await db.query.tenantProductPermissions.findMany({
    where: eq(tenantProductPermissions.tenantId, tenantId),
  });
  if (perms.length === 0) return null; // null = tümü
  return perms.filter((p) => p.allowed).map((p) => p.masterProductId);
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;
    const search = searchParams.get("search")?.trim() || "";

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { defaultMarkupPercent: true },
    });
    const usdRate = await getUsdTryRate();

    const allowed = await allowedProductIds(tenantId);
    const conds = [eq(masterProducts.status, "active")];
    if (allowed !== null) {
      if (allowed.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            defaultMarkupPercent: Number(tenant?.defaultMarkupPercent) || 0,
            usdRate,
            products: [],
            meta: { total: 0, page, limit, totalPages: 0 },
          },
        });
      }
      conds.push(inArray(masterProducts.id, allowed));
    }
    if (search) {
      conds.push(
        or(ilike(masterProducts.name, `%${search}%`), ilike(masterProducts.sku, `%${search}%`))!
      );
    }
    const whereCond = and(...conds);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(masterProducts)
      .where(whereCond);

    const products = await db.query.masterProducts.findMany({
      where: whereCond,
      orderBy: [asc(masterProducts.name)],
      limit,
      offset,
      columns: { id: true, name: true, sku: true },
    });

    const productIds = products.map((p) => p.id);
    const variants = productIds.length
      ? await db.query.masterVariants.findMany({
          where: inArray(masterVariants.masterProductId, productIds),
          columns: {
            id: true,
            masterProductId: true,
            color: true,
            size: true,
            sku: true,
            usdPrice: true,
          },
        })
      : [];

    const priceMap = await getTenantVariantPrices(
      tenantId,
      variants.map((v) => ({ id: v.id, usdPrice: Number(v.usdPrice) }))
    );
    const overrides = variants.length
      ? await db.query.tenantVariantPrices.findMany({
          where: and(
            eq(tenantVariantPrices.tenantId, tenantId),
            inArray(
              tenantVariantPrices.masterVariantId,
              variants.map((v) => v.id)
            )
          ),
        })
      : [];
    const ovMap = new Map(overrides.map((o) => [o.masterVariantId, o]));

    const byProduct = new Map<number, typeof variants>();
    for (const v of variants) {
      const arr = byProduct.get(v.masterProductId) || [];
      arr.push(v);
      byProduct.set(v.masterProductId, arr);
    }

    const result = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      variants: (byProduct.get(p.id) || []).map((v) => {
        const ov = ovMap.get(v.id);
        const computed = priceMap.get(v.id);
        return {
          variantId: v.id,
          color: v.color,
          size: v.size,
          sku: v.sku,
          usdPrice: Number(v.usdPrice),
          mode: ov?.mode ?? null,
          percent: ov?.percent != null ? Number(ov.percent) : null,
          manualPriceTry: ov?.manualPriceTry != null ? Number(ov.manualPriceTry) : null,
          priceTry: computed?.priceTry ?? 0,
          baseTry: computed?.baseTry ?? 0,
        };
      }),
    }));

    return NextResponse.json({
      success: true,
      data: {
        defaultMarkupPercent: Number(tenant?.defaultMarkupPercent) || 0,
        usdRate,
        products: result,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[PANEL/PRICING] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

interface OverrideInput {
  variantId: number;
  mode: "percent" | "manual" | "clear";
  percent?: number;
  manualPriceTry?: number;
}

export async function PUT(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const body = await request.json();

    // Genel markup %
    if (body.defaultMarkupPercent !== undefined) {
      const pct = Number(body.defaultMarkupPercent);
      if (!Number.isFinite(pct) || pct < 0) {
        return NextResponse.json({ error: "Geçersiz kar marjı" }, { status: 400 });
      }
      await db
        .update(tenants)
        .set({ defaultMarkupPercent: String(pct) })
        .where(eq(tenants.id, tenantId));
    }

    // Varyant override'ları
    const overrides: OverrideInput[] = Array.isArray(body.overrides) ? body.overrides : [];
    for (const o of overrides) {
      if (!o || typeof o.variantId !== "number") continue;

      if (o.mode === "clear") {
        await db
          .delete(tenantVariantPrices)
          .where(
            and(
              eq(tenantVariantPrices.tenantId, tenantId),
              eq(tenantVariantPrices.masterVariantId, o.variantId)
            )
          );
        continue;
      }

      const values = {
        tenantId,
        masterVariantId: o.variantId,
        mode: o.mode,
        percent: o.mode === "percent" && o.percent != null ? String(o.percent) : null,
        manualPriceTry:
          o.mode === "manual" && o.manualPriceTry != null ? String(o.manualPriceTry) : null,
        updatedAt: new Date(),
      };
      await db
        .insert(tenantVariantPrices)
        .values(values)
        .onConflictDoUpdate({
          target: [tenantVariantPrices.tenantId, tenantVariantPrices.masterVariantId],
          set: {
            mode: values.mode,
            percent: values.percent,
            manualPriceTry: values.manualPriceTry,
            updatedAt: new Date(),
          },
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[PANEL/PRICING] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

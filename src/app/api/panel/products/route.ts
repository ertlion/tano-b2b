import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  tenants,
  tenantProducts,
  masterProducts,
  tenantProductPermissions,
} from "@/lib/schema";
import { eq, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab") || "mine";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;
    const search = searchParams.get("search")?.trim() || "";

    // Fetch tenant's discount rate
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { discountRate: true },
    });
    const discountRate = Number(tenant?.discountRate ?? 0);

    // Get IDs of products this tenant has pushed
    const pushedProducts = await db.query.tenantProducts.findMany({
      where: eq(tenantProducts.tenantId, tenantId),
      columns: { masterProductId: true },
    });
    const pushedProductIds = new Set(pushedProducts.map((p) => p.masterProductId));

    // Check tenant product permissions
    const permissions = await db.query.tenantProductPermissions.findMany({
      where: eq(tenantProductPermissions.tenantId, tenantId),
    });
    const hasPermissionRecords = permissions.length > 0;
    const allowedProductIds = hasPermissionRecords
      ? new Set(permissions.filter((p) => p.allowed).map((p) => p.masterProductId))
      : null; // null means no restriction

    if (tab === "mine") {
      // Only products this tenant has pushed AND has permission for
      let effectivePushedIds = new Set(pushedProductIds);
      if (allowedProductIds) {
        effectivePushedIds = new Set(
          Array.from(pushedProductIds).filter((id) => allowedProductIds.has(id))
        );
      }

      if (effectivePushedIds.size === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          meta: { total: 0, page, limit, totalPages: 0, discountRate },
        });
      }

      const idArray = Array.from(effectivePushedIds);
      const searchCondition = search
        ? sql`${masterProducts.id} = ANY(ARRAY[${sql.raw(idArray.join(","))}]::int[]) AND (${masterProducts.name} ILIKE ${"%" + search + "%"} OR ${masterProducts.sku} ILIKE ${"%" + search + "%"})`
        : sql`${masterProducts.id} = ANY(ARRAY[${sql.raw(idArray.join(","))}]::int[])`;

      const [countResult] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(masterProducts)
        .where(searchCondition);

      const products = await db.query.masterProducts.findMany({
        where: searchCondition,
        with: { masterVariants: true },
        orderBy: [desc(masterProducts.updatedAt)],
        limit,
        offset,
      });

      return NextResponse.json({
        success: true,
        data: mapProducts(products, discountRate),
        meta: {
          total: countResult?.total ?? 0,
          page,
          limit,
          totalPages: Math.ceil((countResult?.total ?? 0) / limit),
          discountRate,
        },
      });
    }

    // tab === "catalog" — full catalog with pushed status (filtered by permissions)
    const catalogCondition = allowedProductIds
      ? (() => {
          const ids = Array.from(allowedProductIds);
          if (ids.length === 0) {
            return sql`false`;
          }
          return search
            ? sql`${masterProducts.status} = 'active' AND ${masterProducts.id} = ANY(ARRAY[${sql.raw(ids.join(","))}]::int[]) AND (${masterProducts.name} ILIKE ${"%" + search + "%"} OR ${masterProducts.sku} ILIKE ${"%" + search + "%"})`
            : sql`${masterProducts.status} = 'active' AND ${masterProducts.id} = ANY(ARRAY[${sql.raw(ids.join(","))}]::int[])`;
        })()
      : search
        ? sql`${masterProducts.status} = 'active' AND (${masterProducts.name} ILIKE ${"%" + search + "%"} OR ${masterProducts.sku} ILIKE ${"%" + search + "%"})`
        : eq(masterProducts.status, "active");
    const searchCondition = catalogCondition;

    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(masterProducts)
      .where(searchCondition);

    const products = await db.query.masterProducts.findMany({
      where: searchCondition,
      with: { masterVariants: true },
      orderBy: [desc(masterProducts.createdAt)],
      limit,
      offset,
    });

    const data = mapProducts(products, discountRate).map((p) => ({
      ...p,
      isPushed: pushedProductIds.has(p.id),
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: {
        total: countResult?.total ?? 0,
        page,
        limit,
        totalPages: Math.ceil((countResult?.total ?? 0) / limit),
        discountRate,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/PRODUCTS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

function mapProducts(
  products: Array<{
    id: number;
    name: string;
    sku: string;
    barcode: string | null;
    category: string | null;
    subcategory: string | null;
    color: string | null;
    brand: string;
    images: string[];
    masterVariants: Array<{
      id: number;
      size: string;
      color: string | null;
      barcode: string;
      sku: string;
      stockQuantity: number;
      salePrice: string;
      costPrice: string;
    }>;
  }>,
  discountRate: number
) {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    category: product.category,
    subcategory: product.subcategory,
    color: product.color,
    brand: product.brand,
    images: product.images,
    masterVariants: product.masterVariants.map((v) => {
      const salePrice = Number(v.salePrice);
      const customerPrice = discountRate > 0
        ? salePrice * (1 - discountRate / 100)
        : salePrice;
      return {
        id: v.id,
        size: v.size,
        color: v.color,
        barcode: v.barcode,
        sku: v.sku,
        stockQuantity: v.stockQuantity,
        salePrice: v.salePrice,
        customerPrice: customerPrice.toFixed(2),
      };
    }),
  }));
}

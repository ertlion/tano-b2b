import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  tenants,
  masterProducts,
} from "@/lib/schema";
import { eq, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
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

    // Count all active master products
    const searchCondition = search
      ? sql`${masterProducts.status} = 'active' AND (${masterProducts.name} ILIKE ${'%' + search + '%'} OR ${masterProducts.sku} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(masterProducts)
      .where(
        searchCondition
          ? sql`${searchCondition}`
          : eq(masterProducts.status, "active")
      );

    // Fetch all active master products with variants
    const products = await db.query.masterProducts.findMany({
      where: searchCondition
        ? sql`${searchCondition}`
        : eq(masterProducts.status, "active"),
      with: {
        masterVariants: true,
      },
      orderBy: [desc(masterProducts.createdAt)],
      limit,
      offset,
    });

    // Map products with customerPrice calculation
    const data = products.map((product) => ({
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

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { returns, orders, masterVariants, masterProducts, tenants } from "@/lib/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim() || "";
    const tenantId = searchParams.get("tenantId")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status) {
      conditions.push(eq(returns.status, status));
    }
    if (tenantId) {
      const tid = parseInt(tenantId);
      if (!isNaN(tid)) {
        conditions.push(eq(returns.tenantId, tid));
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(returns)
      .where(where);

    const total = countResult?.total ?? 0;

    const returnList = await db
      .select({
        id: returns.id,
        tenantId: returns.tenantId,
        tenantName: tenants.name,
        tenantCompany: tenants.company,
        orderId: returns.orderId,
        orderNumber: orders.orderNumber,
        masterVariantId: returns.masterVariantId,
        masterProductId: returns.masterProductId,
        quantity: returns.quantity,
        reason: returns.reason,
        status: returns.status,
        adminNote: returns.adminNote,
        createdAt: returns.createdAt,
        updatedAt: returns.updatedAt,
        productName: masterProducts.name,
        productImages: masterProducts.images,
        variantColor: masterVariants.color,
        variantSize: masterVariants.size,
        variantSku: masterVariants.sku,
        variantBarcode: masterVariants.barcode,
      })
      .from(returns)
      .leftJoin(tenants, eq(returns.tenantId, tenants.id))
      .leftJoin(orders, eq(returns.orderId, orders.id))
      .leftJoin(masterProducts, eq(returns.masterProductId, masterProducts.id))
      .leftJoin(masterVariants, eq(returns.masterVariantId, masterVariants.id))
      .where(where)
      .orderBy(desc(returns.createdAt))
      .limit(limit)
      .offset(offset);

    const data = returnList.map((r) => {
      const images = r.productImages;
      const firstImage = Array.isArray(images) && images.length > 0 ? images[0] : null;
      return {
        id: r.id,
        tenantId: r.tenantId,
        tenantName: r.tenantName || "-",
        tenantCompany: r.tenantCompany || "-",
        orderId: r.orderId,
        orderNumber: r.orderNumber,
        masterVariantId: r.masterVariantId,
        masterProductId: r.masterProductId,
        quantity: r.quantity,
        reason: r.reason,
        status: r.status,
        adminNote: r.adminNote,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        productName: r.productName || "-",
        productImage: firstImage,
        variantColor: r.variantColor || "-",
        variantSize: r.variantSize || "-",
        variantSku: r.variantSku || "",
        variantBarcode: r.variantBarcode || "",
      };
    });

    return NextResponse.json({
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/RETURNS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { returns, orders, masterVariants, masterProducts } from "@/lib/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const conditions = [eq(returns.tenantId, tenantId)];
    if (status) {
      conditions.push(eq(returns.status, status));
    }

    const where = and(...conditions);

    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(returns)
      .where(where);

    const total = countResult?.total ?? 0;

    const returnList = await db
      .select({
        id: returns.id,
        tenantId: returns.tenantId,
        orderId: returns.orderId,
        masterVariantId: returns.masterVariantId,
        masterProductId: returns.masterProductId,
        quantity: returns.quantity,
        reason: returns.reason,
        status: returns.status,
        adminNote: returns.adminNote,
        createdAt: returns.createdAt,
        updatedAt: returns.updatedAt,
        orderNumber: orders.orderNumber,
        productName: masterProducts.name,
        productImages: masterProducts.images,
        variantColor: masterVariants.color,
        variantSize: masterVariants.size,
        variantSku: masterVariants.sku,
        variantBarcode: masterVariants.barcode,
      })
      .from(returns)
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
    console.error("[PANEL/RETURNS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const body = await request.json();

    const { orderId, masterVariantId, masterProductId, quantity, reason } = body;

    if (!masterVariantId) {
      return NextResponse.json(
        { error: "masterVariantId zorunludur" },
        { status: 400 }
      );
    }

    const qty = Math.max(1, parseInt(String(quantity)) || 1);

    // Look up the variant to get/validate masterProductId
    const variant = await db.query.masterVariants.findFirst({
      where: eq(masterVariants.id, masterVariantId),
    });

    if (!variant) {
      return NextResponse.json(
        { error: "Varyant bulunamadi" },
        { status: 400 }
      );
    }

    const resolvedProductId = masterProductId && masterProductId > 0
      ? masterProductId
      : variant.masterProductId;

    // If orderId provided, validate it belongs to this tenant
    if (orderId) {
      const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)),
      });
      if (!order) {
        return NextResponse.json({ error: "Siparis bulunamadi" }, { status: 400 });
      }
    }

    const [created] = await db
      .insert(returns)
      .values({
        tenantId,
        orderId: orderId || null,
        masterVariantId,
        masterProductId: resolvedProductId,
        quantity: qty,
        reason: reason || null,
        status: "pending",
      })
      .returning();

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[PANEL/RETURNS] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

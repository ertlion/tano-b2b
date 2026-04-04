import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders, masterVariants, masterProducts } from "@/lib/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";

interface RawOrderItem {
  masterVariantId?: number;
  title?: string;
  productName?: string;
  sku?: string;
  barcode?: string;
  size?: string;
  color?: string;
  quantity?: number;
  unitPrice?: number;
}

async function enrichOrderItems(items: unknown) {
  if (!Array.isArray(items)) return [];
  const rawItems = items as RawOrderItem[];
  const variantIds = rawItems
    .map((i) => i.masterVariantId)
    .filter((id): id is number => typeof id === "number" && id > 0);

  let variantMap = new Map<number, { color: string | null; size: string; sku: string; barcode: string; productName: string | null; productImages: string[] | null }>();

  if (variantIds.length > 0) {
    const variants = await db
      .select({
        id: masterVariants.id,
        color: masterVariants.color,
        size: masterVariants.size,
        sku: masterVariants.sku,
        barcode: masterVariants.barcode,
        productName: masterProducts.name,
        productImages: masterProducts.images,
      })
      .from(masterVariants)
      .leftJoin(masterProducts, eq(masterVariants.masterProductId, masterProducts.id))
      .where(inArray(masterVariants.id, variantIds));
    variantMap = new Map(variants.map((v) => [v.id, v]));
  }

  return rawItems.map((item) => {
    const variant = item.masterVariantId ? variantMap.get(item.masterVariantId) : undefined;
    const images = variant?.productImages;
    const firstImage = Array.isArray(images) && images.length > 0 ? images[0] : null;
    return {
      productName: variant?.productName || String(item.title || item.productName || "-"),
      productImage: firstImage,
      color: variant?.color || String(item.color || "-"),
      size: variant?.size || String(item.size || "-"),
      sku: variant?.sku || String(item.sku || ""),
      barcode: variant?.barcode || String(item.barcode || ""),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const conditions = [eq(orders.tenantId, tenantId)];
    if (status) {
      conditions.push(eq(orders.status, status));
    }

    const where = and(...conditions);

    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .where(where);

    const total = countResult?.total ?? 0;

    const orderList = await db.query.orders.findMany({
      where,
      orderBy: [desc(orders.createdAt)],
      limit,
      offset,
      columns: {
        id: true,
        orderNumber: true,
        externalOrderId: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        shippingAddress: true,
        items: true,
        totalAmount: true,
        currency: true,
        status: true,
        cargoCompany: true,
        cargoTrackingNumber: true,
        cargoTrackingUrl: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const enrichedOrders = await Promise.all(
      orderList.map(async (order) => {
        const enrichedItems = await enrichOrderItems(order.items);
        return { ...order, enrichedItems };
      })
    );

    return NextResponse.json({
      success: true,
      data: enrichedOrders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/ORDERS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

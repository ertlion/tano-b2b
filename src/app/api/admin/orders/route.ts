import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders, tenants, masterVariants, masterProducts } from "@/lib/schema";
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

interface EnrichedItem {
  productName: string;
  productImage: string | null;
  color: string;
  size: string;
  sku: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
}

async function enrichOrderItems(
  items: unknown
): Promise<EnrichedItem[]> {
  if (!Array.isArray(items)) return [];

  const rawItems = items as RawOrderItem[];
  const variantIds = rawItems
    .map((i) => i.masterVariantId)
    .filter((id): id is number => typeof id === "number" && id > 0);

  if (variantIds.length === 0) {
    return rawItems.map((item) => ({
      productName: String(item.title || item.productName || "-"),
      productImage: null,
      color: String(item.color || "-"),
      size: String(item.size || "-"),
      sku: String(item.sku || ""),
      barcode: String(item.barcode || ""),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
    }));
  }

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

  const variantMap = new Map(variants.map((v) => [v.id, v]));

  return rawItems.map((item) => {
    const variant = item.masterVariantId
      ? variantMap.get(item.masterVariantId)
      : undefined;
    const images = variant?.productImages;
    const firstImage =
      Array.isArray(images) && images.length > 0 ? images[0] : null;

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
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim() || "";
    const tenantId = searchParams.get("tenantId")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status) {
      conditions.push(eq(orders.status, status));
    }
    if (tenantId) {
      const tid = parseInt(tenantId);
      if (!isNaN(tid)) {
        conditions.push(eq(orders.tenantId, tid));
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .where(where);

    const total = countResult?.total ?? 0;

    // Fetch orders with tenant info
    const orderList = await db
      .select({
        id: orders.id,
        tenantId: orders.tenantId,
        tenantName: tenants.name,
        tenantCompany: tenants.company,
        orderNumber: orders.orderNumber,
        externalOrderId: orders.externalOrderId,
        customerName: orders.customerName,
        customerEmail: orders.customerEmail,
        customerPhone: orders.customerPhone,
        shippingAddress: orders.shippingAddress,
        items: orders.items,
        totalAmount: orders.totalAmount,
        currency: orders.currency,
        status: orders.status,
        cargoCompany: orders.cargoCompany,
        cargoTrackingNumber: orders.cargoTrackingNumber,
        cargoTrackingUrl: orders.cargoTrackingUrl,
        notes: orders.notes,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .leftJoin(tenants, eq(orders.tenantId, tenants.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    // Enrich items with product data
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
    console.error("[ADMIN/ORDERS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

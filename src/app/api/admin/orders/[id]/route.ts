import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  orders,
  orderStatusHistory,
  masterVariants,
  masterProducts,
  stockMovements,
} from "@/lib/schema";
import { eq, inArray } from "drizzle-orm";
import { sendOrderStatusEmail } from "@/lib/mailer";
import { syncAllTenantsStock } from "@/lib/sync-engine";

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

// Tano Toptan durum makinesi (Epic D):
// bekleniyor → hazirlanacak → paketlendi → gonderildi (her aşamada iptal mümkün)
const VALID_TRANSITIONS: Record<string, string[]> = {
  bekleniyor: ["hazirlanacak", "cancelled"],
  hazirlanacak: ["paketlendi", "cancelled"],
  paketlendi: ["gonderildi", "cancelled"],
  gonderildi: ["returned"],
  pending_review: ["bekleniyor", "hazirlanacak", "cancelled"],
  cancelled: [],
  returned: [],
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const orderId = parseInt(id);

    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Geçersiz sipariş ID" }, { status: 400 });
    }

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        tenant: {
          columns: {
            id: true,
            name: true,
            email: true,
            company: true,
            phone: true,
            marketplace: true,
          },
        },
        orderStatusHistory: {
          orderBy: (h, { desc }) => [desc(h.createdAt)],
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
    }

    // Enrich items with product data
    const rawItems = Array.isArray(order.items)
      ? (order.items as RawOrderItem[])
      : [];
    const variantIds = rawItems
      .map((i) => i.masterVariantId)
      .filter((id): id is number => typeof id === "number" && id > 0);

    let variantMap = new Map<
      number,
      { color: string | null; size: string; sku: string; barcode: string; productName: string | null; productImages: string[] | null }
    >();

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
        .leftJoin(
          masterProducts,
          eq(masterVariants.masterProductId, masterProducts.id)
        )
        .where(inArray(masterVariants.id, variantIds));

      variantMap = new Map(variants.map((v) => [v.id, v]));
    }

    const enrichedItems = rawItems.map((item) => {
      const variant = item.masterVariantId
        ? variantMap.get(item.masterVariantId)
        : undefined;
      const images = variant?.productImages;
      const firstImage =
        Array.isArray(images) && images.length > 0 ? images[0] : null;

      return {
        productName:
          variant?.productName ||
          String(item.title || item.productName || "-"),
        productImage: firstImage,
        color: variant?.color || String(item.color || "-"),
        size: variant?.size || String(item.size || "-"),
        sku: variant?.sku || String(item.sku || ""),
        barcode: variant?.barcode || String(item.barcode || ""),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
      };
    });

    return NextResponse.json({
      success: true,
      data: { ...order, enrichedItems },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/ORDERS/:id] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const orderId = parseInt(id);

    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Geçersiz sipariş ID" }, { status: 400 });
    }

    const body = await request.json();
    const {
      status: newStatus,
      cargoCompany,
      cargoTrackingNumber,
      cargoTrackingUrl,
      note,
    } = body;

    if (!newStatus) {
      return NextResponse.json(
        { error: "Yeni durum (status) zorunlu" },
        { status: 400 }
      );
    }

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        tenant: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
    }

    // Validate status transition
    const allowedNext = VALID_TRANSITIONS[order.status];
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Geçersiz durum geçişi: ${order.status} -> ${newStatus}. Izin verilen: ${allowedNext?.join(", ") || "yok"}`,
        },
        { status: 400 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date(),
    };

    // Kargo bilgisi opsiyonel (kargo entegrasyonu pasif) — admin elle girerse kaydet.
    if (cargoCompany) updateData.cargoCompany = cargoCompany;
    if (cargoTrackingNumber) updateData.cargoTrackingNumber = cargoTrackingNumber;
    if (cargoTrackingUrl) updateData.cargoTrackingUrl = cargoTrackingUrl;

    if (note) updateData.notes = note;

    // Update order
    const [updated] = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, orderId))
      .returning();

    // Log status history
    await db.insert(orderStatusHistory).values({
      orderId,
      fromStatus: order.status,
      toStatus: newStatus,
      note: note || null,
    });

    // Send email notification to tenant
    if (order.tenant) {
      sendOrderStatusEmail({
        tenantEmail: order.tenant.email,
        tenantName: order.tenant.name,
        orderNumber: order.orderNumber,
        newStatus,
        cargoCompany: cargoCompany || undefined,
        cargoTrackingNumber: cargoTrackingNumber || undefined,
        cargoTrackingUrl: cargoTrackingUrl || undefined,
        note: note || undefined,
      }).catch((err) => {
        console.error("[ORDERS] Failed to send status email:", err);
      });
    }

    // If cancelled or returned: restore stock
    if (newStatus === "cancelled" || newStatus === "returned") {
      try {
        await restoreOrderStock(order.id, order.items, newStatus);
        // Sync after stock restoration
        syncAllTenantsStock().catch((err) => {
          console.error("[ORDERS] Stock sync after restore failed:", err);
        });
      } catch (err) {
        console.error("[ORDERS] Stock restore failed:", err);
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/ORDERS/:id] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/**
 * Restore stock for order items when order is cancelled/returned.
 * items is expected to be an array of { masterVariantId, quantity, ... }
 */
async function restoreOrderStock(
  orderId: number,
  items: unknown,
  reason: string
) {
  if (!Array.isArray(items)) return;

  for (const item of items) {
    const variantId = item.masterVariantId;
    const quantity = item.quantity;

    if (!variantId || !quantity || typeof quantity !== "number") continue;

    const variant = await db.query.masterVariants.findFirst({
      where: eq(masterVariants.id, variantId),
    });

    if (!variant) continue;

    const previousStock = variant.stockQuantity;
    const newStock = previousStock + quantity;

    await db
      .update(masterVariants)
      .set({ stockQuantity: newStock, updatedAt: new Date() })
      .where(eq(masterVariants.id, variantId));

    await db.insert(stockMovements).values({
      masterVariantId: variantId,
      type: `order_${reason}`,
      quantity,
      previousStock,
      newStock,
      reference: `Order #${orderId} ${reason}`,
    });
  }
}

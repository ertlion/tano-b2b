import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders, masterVariants, stockMovements, orderStatusHistory } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { syncAllTenantsStock } from "@/lib/sync-engine";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface OrderItem {
  masterVariantId?: number;
  quantity?: number;
  sku?: string;
  title?: string;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = await requireAuth(request);
    const { id } = await params;
    const orderId = parseInt(id);

    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Gecersiz siparis ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const action = (body as { action?: string }).action || "confirm";

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)),
    });

    if (!order) {
      return NextResponse.json({ error: "Siparis bulunamadi" }, { status: 404 });
    }

    if (order.status !== "pending_review") {
      return NextResponse.json(
        { error: "Bu siparis onay bekleyen durumda degil" },
        { status: 400 }
      );
    }

    if (action === "reject") {
      // Cancel the order without stock decrease
      await db
        .update(orders)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await db.insert(orderStatusHistory).values({
        orderId,
        fromStatus: "pending_review",
        toStatus: "cancelled",
        note: "Bayi tarafindan reddedildi (iade gecmisi nedeniyle)",
      });

      return NextResponse.json({ success: true, status: "cancelled" });
    }

    // Confirm: decrease stock
    const items = Array.isArray(order.items) ? (order.items as OrderItem[]) : [];

    for (const item of items) {
      if (!item.masterVariantId || !item.quantity) continue;

      const currentVariant = await db.query.masterVariants.findFirst({
        where: eq(masterVariants.id, item.masterVariantId),
      });

      if (!currentVariant) continue;

      const previousStock = currentVariant.stockQuantity;
      const newStock = Math.max(0, previousStock - item.quantity);

      await db
        .update(masterVariants)
        .set({ stockQuantity: newStock, updatedAt: new Date() })
        .where(eq(masterVariants.id, item.masterVariantId));

      await db.insert(stockMovements).values({
        masterVariantId: item.masterVariantId,
        type: "order",
        quantity: -item.quantity,
        previousStock,
        newStock,
        reference: `confirmed#${order.orderNumber}`,
      });
    }

    await db
      .update(orders)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await db.insert(orderStatusHistory).values({
      orderId,
      fromStatus: "pending_review",
      toStatus: "processing",
      note: "Bayi tarafindan onaylandi (iade gecmisi kontrol edildi)",
    });

    // Fire-and-forget stock sync
    syncAllTenantsStock().catch((err) => {
      console.error("[ORDER-CONFIRM] syncAllTenantsStock failed:", err);
    });

    return NextResponse.json({ success: true, status: "processing" });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[PANEL/ORDERS/:id/CONFIRM] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

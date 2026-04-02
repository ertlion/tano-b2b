import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  orders,
  orderStatusHistory,
  tenants,
  masterVariants,
  stockMovements,
} from "@/lib/schema";
import { eq } from "drizzle-orm";
import { sendOrderStatusEmail } from "@/lib/mailer";
import { syncAllTenantsStock } from "@/lib/sync-engine";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const orderId = parseInt(id);

    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Gecersiz siparis ID" }, { status: 400 });
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
      return NextResponse.json({ error: "Siparis bulunamadi" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/ORDERS/:id] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const orderId = parseInt(id);

    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Gecersiz siparis ID" }, { status: 400 });
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
      return NextResponse.json({ error: "Siparis bulunamadi" }, { status: 404 });
    }

    // Validate status transition
    const allowedNext = VALID_TRANSITIONS[order.status];
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Gecersiz durum gecisi: ${order.status} -> ${newStatus}. Izin verilen: ${allowedNext?.join(", ") || "yok"}`,
        },
        { status: 400 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (newStatus === "shipped") {
      if (cargoCompany) updateData.cargoCompany = cargoCompany;
      if (cargoTrackingNumber) updateData.cargoTrackingNumber = cargoTrackingNumber;
      if (cargoTrackingUrl) updateData.cargoTrackingUrl = cargoTrackingUrl;
    }

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
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
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

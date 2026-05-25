import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  orders,
  orderStatusHistory,
  masterVariants,
  stockMovements,
} from "@/lib/schema";
import { eq } from "drizzle-orm";
import { sendOrderStatusEmail } from "@/lib/mailer";
import { syncAllTenantsStock } from "@/lib/sync-engine";
import { getCargoTrackingUrl, resolveProviderName } from "@/lib/cargo/registry";
import { addBalance } from "@/lib/balance";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Tano Toptan durum makinesi (Epic D + Epic E):
// bekleniyor → hazirlanacak → paketlendi → gonderildi.
// İptal SADECE fatura/etiket yüklenmemişken (bekleniyor / pending_review) mümkün.
// hazirlanacak ve sonrası iptal edilemez (belge yüklenmiş sayılır).
const VALID_TRANSITIONS: Record<string, string[]> = {
  bekleniyor: ["hazirlanacak", "cancelled"],
  hazirlanacak: ["paketlendi"],
  paketlendi: ["gonderildi"],
  gonderildi: [],
  pending_review: ["bekleniyor", "hazirlanacak", "cancelled"],
  cancelled: [],
  returned: [],
};

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

    if (!newStatus || typeof newStatus !== "string") {
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

    const allowedNext = VALID_TRANSITIONS[order.status];
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Geçersiz durum geçişi: ${order.status} -> ${newStatus}. Izin verilen: ${allowedNext?.join(", ") || "yok"}`,
        },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date(),
    };

    // Kargo bilgisi opsiyonel (kargo entegrasyonu pasif) — admin elle girerse kaydet.
    if (cargoCompany) updateData.cargoCompany = cargoCompany;
    if (cargoTrackingNumber) updateData.cargoTrackingNumber = cargoTrackingNumber;
    if (cargoTrackingUrl) {
      updateData.cargoTrackingUrl = cargoTrackingUrl;
    } else if (cargoCompany && cargoTrackingNumber) {
      const provider = resolveProviderName(cargoCompany);
      if (provider) {
        const autoUrl = getCargoTrackingUrl(provider, cargoTrackingNumber);
        if (autoUrl) updateData.cargoTrackingUrl = autoUrl;
      }
    }

    if (note) updateData.notes = note;

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

    // Send email notification
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
        console.error("[ORDERS/STATUS] Failed to send status email:", err);
      });
    }

    // If cancelled or returned: restore stock + refund product balance (Epic E)
    if (newStatus === "cancelled" || newStatus === "returned") {
      try {
        await restoreOrderStock(order.id, order.items, newStatus);
        syncAllTenantsStock().catch((err) => {
          console.error("[ORDERS/STATUS] Stock sync after restore failed:", err);
        });
        const charged = Number(order.balanceCharged) || 0;
        if (charged > 0) {
          await addBalance(order.tenantId, "product", charged, "refund", {
            reference: `iptal#${order.orderNumber}`,
            note: "Sipariş iptali bakiye iadesi",
          });
        }
      } catch (err) {
        console.error("[ORDERS/STATUS] Stock/balance restore failed:", err);
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
    console.error("[ADMIN/ORDERS/:id/status] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

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

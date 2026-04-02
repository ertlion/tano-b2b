import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, settings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { processIncomingOrder } from "@/lib/order-processor";
import type { IncomingOrder } from "@/lib/order-processor";

// ─── TENANT LOOKUP ────────────────────────────────────────

async function findTenantByTsoft(storeUrl: string): Promise<number | null> {
  if (storeUrl) {
    const result = await db.query.settings.findFirst({
      where: and(
        eq(settings.key, "tsoft_store_url"),
        eq(settings.value, storeUrl)
      ),
    });

    if (result) {
      const tenant = await db.query.tenants.findFirst({
        where: and(
          eq(tenants.id, result.tenantId),
          eq(tenants.isActive, true),
          eq(tenants.isApproved, true)
        ),
      });
      if (tenant) return tenant.id;
    }
  }

  // Fallback: find any tenant with tsoft credentials
  const result = await db.query.settings.findFirst({
    where: eq(settings.key, "tsoft_api_key"),
  });

  if (!result) return null;

  const tenant = await db.query.tenants.findFirst({
    where: and(
      eq(tenants.id, result.tenantId),
      eq(tenants.isActive, true),
      eq(tenants.isApproved, true)
    ),
  });

  return tenant?.id ?? null;
}

// ─── POST HANDLER ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // 1. Find tenant
    const storeUrl = payload.storeUrl ?? payload.store_url ?? "";
    const tenantId = await findTenantByTsoft(String(storeUrl));

    if (!tenantId) {
      return NextResponse.json(
        { code: "WEBHOOK_002", message: "Unknown TSoft store" },
        { status: 404 }
      );
    }

    // 2. Parse TSoft order payload
    const order = payload.order ?? payload;
    const shippingAddr = order.shippingAddress ?? order.shipping_address ?? order.address ?? {};

    const incomingOrder: IncomingOrder = {
      tenantId,
      marketplace: "tsoft",
      externalOrderId: String(order.id ?? order.orderId ?? order.order_id ?? ""),
      orderNumber: String(order.orderNumber ?? order.order_number ?? order.siparisNo ?? order.id ?? ""),
      customerName:
        order.customerName ??
        order.customer_name ??
        order.musteriAdi ??
        (`${shippingAddr.firstName ?? shippingAddr.name ?? ""} ${shippingAddr.lastName ?? ""}`.trim() || "Unknown"),
      customerEmail: order.customerEmail ?? order.customer_email ?? order.email ?? undefined,
      customerPhone:
        order.customerPhone ?? order.customer_phone ?? order.phone ?? shippingAddr.phone ?? undefined,
      shippingAddress: shippingAddr,
      items: (
        (order.lineItems ?? order.line_items ?? order.items ?? order.products) as Record<string, unknown>[] ?? []
      ).map((li: Record<string, unknown>) => ({
        sku: String(li.sku ?? li.stockCode ?? li.stokKodu ?? ""),
        barcode: li.barcode ? String(li.barcode) : undefined,
        quantity: Number(li.quantity ?? li.adet ?? 1),
        unitPrice: Number(li.unitPrice ?? li.unit_price ?? li.price ?? li.fiyat ?? 0),
        title: String(li.title ?? li.name ?? li.productName ?? li.urunAdi ?? ""),
        size: li.variantTitle
          ? String(li.variantTitle)
          : li.variant_title
            ? String(li.variant_title)
            : li.beden
              ? String(li.beden)
              : undefined,
      })),
      totalAmount: Number(
        order.totalPrice ?? order.total_price ?? order.totalAmount ?? order.toplamTutar ?? 0
      ),
      currency: order.currency ?? "TRY",
    };

    // 3. Process
    const result = await processIncomingOrder(incomingOrder);

    if (!result.success) {
      console.error("[WEBHOOK/TSOFT] Order processing failed:", result.error);
      return NextResponse.json(
        { code: "WEBHOOK_003", message: result.error },
        { status: 422 }
      );
    }

    return NextResponse.json({ ok: true, orderId: result.orderId });
  } catch (err) {
    console.error("[WEBHOOK/TSOFT] Unexpected error:", err);
    return NextResponse.json(
      { code: "WEBHOOK_500", message: "Internal server error" },
      { status: 500 }
    );
  }
}

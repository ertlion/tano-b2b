import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, settings, orders, orderStatusHistory } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { processIncomingOrder } from "@/lib/order-processor";
import type { IncomingOrder } from "@/lib/order-processor";

// ─── TENANT LOOKUP ────────────────────────────────────────

async function findTenantByShopifyDomain(shopDomain: string): Promise<number | null> {
  let result = await db.query.settings.findFirst({
    where: and(
      eq(settings.key, "shopify_store_url"),
      eq(settings.value, shopDomain)
    ),
  });

  if (!result) {
    const cleaned = shopDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    result = await db.query.settings.findFirst({
      where: and(
        eq(settings.key, "shopify_store_url"),
        eq(settings.value, cleaned)
      ),
    });
  }

  if (!result) {
    console.error(`[WEBHOOK/SHOPIFY] No tenant found for domain: ${shopDomain}`);
    return null;
  }

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
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    const shopDomain = request.headers.get("X-Shopify-Shop-Domain") ?? "";
    const topic = request.headers.get("X-Shopify-Topic") ?? "";
    const tenantId = await findTenantByShopifyDomain(shopDomain);

    if (!tenantId) {
      return NextResponse.json(
        { code: "WEBHOOK_002", message: "Unknown shop domain" },
        { status: 404 }
      );
    }

    console.log(`[WEBHOOK/SHOPIFY] topic=${topic}, order=${payload.id || payload.order_id}`);

    // Route by topic
    if (topic === "orders/create") {
      return await handleOrderCreate(tenantId, payload);
    }

    if (topic === "orders/updated") {
      return await handleOrderUpdate(tenantId, payload);
    }

    // Unknown topic — still try to process as order create (backward compat)
    if (payload.line_items) {
      return await handleOrderCreate(tenantId, payload);
    }

    return NextResponse.json({ ok: true, message: "Unhandled topic" });
  } catch (err) {
    console.error("[WEBHOOK/SHOPIFY] Unexpected error:", err);
    return NextResponse.json(
      { code: "WEBHOOK_500", message: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── ORDER CREATE ─────────────────────────────────────────

async function handleOrderCreate(tenantId: number, payload: Record<string, unknown>) {
  const shippingAddr = (payload.shipping_address ?? {}) as Record<string, unknown>;
  const billingAddr = (payload.billing_address ?? {}) as Record<string, unknown>;
  const customer = (payload.customer ?? {}) as Record<string, unknown>;

  const customerName =
    shippingAddr.name ||
    billingAddr.name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    payload.contact_email ||
    payload.email ||
    "Bilinmeyen Müşteri";

  const incomingOrder: IncomingOrder = {
    tenantId,
    marketplace: "shopify",
    externalOrderId: String(payload.id),
    orderNumber: String(payload.order_number ?? payload.name ?? payload.id),
    customerName: String(customerName),
    customerEmail: String(payload.contact_email ?? payload.email ?? customer.email ?? ""),
    customerPhone: String(shippingAddr.phone ?? billingAddr.phone ?? customer.phone ?? ""),
    shippingAddress: shippingAddr.address1 ? shippingAddr : billingAddr.address1 ? billingAddr : undefined,
    items: ((payload.line_items ?? []) as Record<string, unknown>[]).map((li) => ({
      sku: String(li.sku ?? ""),
      barcode: li.barcode ? String(li.barcode) : undefined,
      quantity: Number(li.quantity ?? 1),
      unitPrice: Number(li.price ?? 0),
      title: String(li.title ?? "") + (li.variant_title ? ` - ${li.variant_title}` : ""),
      size: li.variant_title ? String(li.variant_title) : undefined,
    })),
    totalAmount: Number(payload.total_price ?? payload.subtotal_price ?? 0),
    currency: String(payload.currency ?? "TRY"),
  };

  const result = await processIncomingOrder(incomingOrder);

  if (!result.success) {
    console.error("[WEBHOOK/SHOPIFY] Order create failed:", result.error);
    return NextResponse.json({ code: "WEBHOOK_003", message: result.error }, { status: 422 });
  }

  // Check if fulfillment data already exists (order created with fulfillment)
  if (result.orderId) {
    await updateFulfillmentFromPayload(result.orderId, payload);
  }

  return NextResponse.json({ ok: true, orderId: result.orderId });
}

// ─── ORDER UPDATE (fulfillment, cancellation, etc) ─────────

async function handleOrderUpdate(tenantId: number, payload: Record<string, unknown>) {
  const externalOrderId = String(payload.id);

  // Find existing order
  const existingOrder = await db.query.orders.findFirst({
    where: and(
      eq(orders.tenantId, tenantId),
      eq(orders.externalOrderId, externalOrderId)
    ),
  });

  if (!existingOrder) {
    // Order doesn't exist yet — treat as create
    if ((payload.line_items as unknown[])?.length > 0) {
      return await handleOrderCreate(tenantId, payload);
    }
    return NextResponse.json({ ok: true, message: "Order not found, skipped" });
  }

  // Update fulfillment/cargo info
  await updateFulfillmentFromPayload(existingOrder.id, payload);

  // Check for cancellation
  const cancelledAt = payload.cancelled_at;
  const cancelReason = payload.cancel_reason;
  if (cancelledAt && existingOrder.status !== "cancelled") {
    const previousStatus = existingOrder.status;
    await db.update(orders).set({
      status: "cancelled",
      notes: cancelReason ? `Shopify iptal: ${cancelReason}` : "Shopify'dan iptal edildi",
      updatedAt: new Date(),
    }).where(eq(orders.id, existingOrder.id));

    await db.insert(orderStatusHistory).values({
      orderId: existingOrder.id,
      fromStatus: previousStatus,
      toStatus: "cancelled",
      note: cancelReason ? `Shopify iptal nedeni: ${cancelReason}` : "Shopify'dan iptal edildi",
    });

    console.log(`[WEBHOOK/SHOPIFY] Order ${existingOrder.orderNumber} cancelled`);
  }

  // Check for financial status change
  const financialStatus = String(payload.financial_status ?? "");
  if (financialStatus === "paid" && existingOrder.status === "new") {
    await db.update(orders).set({
      status: "processing",
      updatedAt: new Date(),
    }).where(eq(orders.id, existingOrder.id));

    await db.insert(orderStatusHistory).values({
      orderId: existingOrder.id,
      fromStatus: "new",
      toStatus: "processing",
      note: "Shopify ödeme onaylandı",
    });
  }

  return NextResponse.json({ ok: true, orderId: existingOrder.id });
}

// ─── FULFILLMENT PARSER ──────────────────────────────────

async function updateFulfillmentFromPayload(orderId: number, payload: Record<string, unknown>) {
  const fulfillments = (payload.fulfillments ?? []) as Record<string, unknown>[];
  if (fulfillments.length === 0) return;

  // Use the most recent fulfillment
  const latest = fulfillments[fulfillments.length - 1];
  const trackingCompany = String(latest.tracking_company ?? "");
  const trackingNumber = String(latest.tracking_number ?? "");
  const trackingUrls = Array.isArray(latest.tracking_urls) ? latest.tracking_urls : [];
  const trackingUrl = String(latest.tracking_url ?? trackingUrls[0] ?? "");
  const fulfillmentStatus = String(latest.status ?? "");

  if (!trackingNumber && !trackingCompany) return;

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { status: true, cargoTrackingNumber: true },
  });

  if (!order) return;

  // Update cargo info
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (trackingCompany) updateData.cargoCompany = trackingCompany;
  if (trackingNumber) updateData.cargoTrackingNumber = trackingNumber;
  if (trackingUrl) updateData.cargoTrackingUrl = trackingUrl;

  // Tano Toptan (Epic D): pazaryeri fulfillment'ı Tano iç durumunu EZMEZ.
  // Sipariş durumu üye (fatura+etiket) + admin (işleme alma) tarafından yönetilir.
  // Buradan yalnızca bilgi amaçlı kargo takip verisi yakalanır.
  void fulfillmentStatus;

  await db.update(orders).set(updateData).where(eq(orders.id, orderId));

  // Only log if tracking number is new
  if (trackingNumber && trackingNumber !== order.cargoTrackingNumber) {
    console.log(`[WEBHOOK/SHOPIFY] Order ${orderId} shipped: ${trackingCompany} ${trackingNumber}`);
  }
}

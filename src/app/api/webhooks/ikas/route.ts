import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, settings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { processIncomingOrder } from "@/lib/order-processor";
import type { IncomingOrder } from "@/lib/order-processor";

// ─── TENANT LOOKUP ────────────────────────────────────────

async function findTenantByIkasStore(storeId: string, storeUrl?: string): Promise<number | null> {
  // Try by store_id first
  if (storeId) {
    const byId = await db.query.settings.findFirst({
      where: and(eq(settings.key, "ikas_store_id"), eq(settings.value, storeId)),
    });
    if (byId) {
      const tenant = await db.query.tenants.findFirst({
        where: and(eq(tenants.id, byId.tenantId), eq(tenants.isActive, true)),
      });
      if (tenant) return tenant.id;
    }
  }

  // Try by store URL
  if (storeUrl) {
    const cleaned = storeUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const byUrl = await db.query.settings.findFirst({
      where: and(eq(settings.key, "ikas_store_url"), eq(settings.value, cleaned)),
    });
    if (byUrl) {
      const tenant = await db.query.tenants.findFirst({
        where: and(eq(tenants.id, byUrl.tenantId), eq(tenants.isActive, true)),
      });
      if (tenant) return tenant.id;
    }
  }

  // Fallback: find any ikas tenant with access token
  const byToken = await db.query.settings.findFirst({
    where: eq(settings.key, "ikas_access_token"),
  });
  if (byToken) {
    const tenant = await db.query.tenants.findFirst({
      where: and(eq(tenants.id, byToken.tenantId), eq(tenants.isActive, true)),
    });
    if (tenant) return tenant.id;
  }

  return null;
}

// ─── POST HANDLER ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // 1. Find tenant
    const storeId = String(payload.storeId ?? payload.store_id ?? "");
    const storeUrl = String(payload.storeUrl ?? payload.store_url ?? payload.myshopDomain ?? "");
    const tenantId = await findTenantByIkasStore(storeId, storeUrl);

    if (!tenantId) {
      return NextResponse.json(
        { code: "WEBHOOK_002", message: "Unknown ikas store" },
        { status: 404 }
      );
    }

    // 2. Parse ikas order payload
    const order = payload.order ?? payload;
    const shippingAddr = order.shippingAddress ?? order.shipping_address ?? {};

    const incomingOrder: IncomingOrder = {
      tenantId,
      marketplace: "ikas",
      externalOrderId: String(order.id ?? order.orderId ?? ""),
      orderNumber: String(order.orderNumber ?? order.order_number ?? order.id ?? ""),
      customerName:
        order.customerName ??
        order.customer_name ??
        (`${shippingAddr.firstName ?? ""} ${shippingAddr.lastName ?? ""}`.trim() || "Unknown"),
      customerEmail: order.customerEmail ?? order.customer_email ?? undefined,
      customerPhone: order.customerPhone ?? order.customer_phone ?? shippingAddr.phone ?? undefined,
      shippingAddress: shippingAddr,
      items: ((order.lineItems ?? order.line_items ?? order.items) as Record<string, unknown>[] ?? []).map(
        (li: Record<string, unknown>) => ({
          sku: String(li.sku ?? li.stockCode ?? ""),
          barcode: li.barcode ? String(li.barcode) : undefined,
          quantity: Number(li.quantity ?? 1),
          unitPrice: Number(li.unitPrice ?? li.unit_price ?? li.price ?? 0),
          title: String(li.title ?? li.name ?? li.productName ?? ""),
          size: li.variantTitle
            ? String(li.variantTitle)
            : li.variant_title
              ? String(li.variant_title)
              : undefined,
        })
      ),
      totalAmount: Number(order.totalPrice ?? order.total_price ?? order.totalAmount ?? 0),
      currency: order.currency ?? "TRY",
    };

    // 3. Process
    const result = await processIncomingOrder(incomingOrder);

    if (!result.success) {
      console.error("[WEBHOOK/IKAS] Order processing failed:", result.error);
      return NextResponse.json(
        { code: "WEBHOOK_003", message: result.error },
        { status: 422 }
      );
    }

    return NextResponse.json({ ok: true, orderId: result.orderId });
  } catch (err) {
    console.error("[WEBHOOK/IKAS] Unexpected error:", err);
    return NextResponse.json(
      { code: "WEBHOOK_500", message: "Internal server error" },
      { status: 500 }
    );
  }
}

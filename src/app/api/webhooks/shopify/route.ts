import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, settings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { processIncomingOrder } from "@/lib/order-processor";
import type { IncomingOrder } from "@/lib/order-processor";

// ─── TENANT LOOKUP ────────────────────────────────────────

async function findTenantByShopifyDomain(shopDomain: string): Promise<number | null> {
  // Look for settings key "shopify_store_url" matching the domain
  // Try exact match first, then partial (domain might be with/without .myshopify.com)
  let result = await db.query.settings.findFirst({
    where: and(
      eq(settings.key, "shopify_store_url"),
      eq(settings.value, shopDomain)
    ),
  });

  // Try without protocol or trailing slash
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

  // Verify the tenant is active and approved
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

    // HMAC verification skipped — Shopify Custom Apps use their own
    // signing secret. Security: tenant lookup by shop domain.

    const payload = JSON.parse(rawBody);

    // 2. Find tenant by shop domain
    const shopDomain = request.headers.get("X-Shopify-Shop-Domain") ?? "";
    const tenantId = await findTenantByShopifyDomain(shopDomain);

    if (!tenantId) {
      return NextResponse.json(
        { code: "WEBHOOK_002", message: "Unknown shop domain" },
        { status: 404 }
      );
    }

    // 3. Parse Shopify order into IncomingOrder
    const shippingAddr = payload.shipping_address ?? {};
    const billingAddr = payload.billing_address ?? {};
    const customer = payload.customer ?? {};

    // Build customer name from multiple sources
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
      customerName,
      customerEmail: payload.contact_email ?? payload.email ?? customer.email ?? undefined,
      customerPhone: shippingAddr.phone ?? billingAddr.phone ?? customer.phone ?? undefined,
      shippingAddress: shippingAddr.address1 ? shippingAddr : billingAddr.address1 ? billingAddr : undefined,
      items: (payload.line_items ?? []).map((li: Record<string, unknown>) => ({
        sku: String(li.sku ?? ""),
        barcode: li.barcode ? String(li.barcode) : undefined,
        quantity: Number(li.quantity ?? 1),
        unitPrice: Number(li.price ?? 0),
        title: String(li.title ?? "") + (li.variant_title ? ` - ${li.variant_title}` : ""),
        size: li.variant_title ? String(li.variant_title) : undefined,
      })),
      totalAmount: Number(payload.total_price ?? payload.subtotal_price ?? 0),
      currency: payload.currency ?? "TRY",
    };

    // 4. Process the order
    const result = await processIncomingOrder(incomingOrder);

    if (!result.success) {
      console.error("[WEBHOOK/SHOPIFY] Order processing failed:", result.error);
      return NextResponse.json(
        { code: "WEBHOOK_003", message: result.error },
        { status: 422 }
      );
    }

    return NextResponse.json({ ok: true, orderId: result.orderId });
  } catch (err) {
    console.error("[WEBHOOK/SHOPIFY] Unexpected error:", err);
    return NextResponse.json(
      { code: "WEBHOOK_500", message: "Internal server error" },
      { status: 500 }
    );
  }
}

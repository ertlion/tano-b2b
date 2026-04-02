import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { tenants, settings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { processIncomingOrder } from "@/lib/order-processor";
import type { IncomingOrder } from "@/lib/order-processor";

// ─── HMAC VERIFICATION ───────────────────────────────────

function verifyShopifyHmac(body: string, hmacHeader: string): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false;

  const computed = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(hmacHeader)
  );
}

// ─── TENANT LOOKUP ────────────────────────────────────────

async function findTenantByShopifyDomain(shopDomain: string): Promise<number | null> {
  // Look for settings key like "shopify_store_url" matching the domain
  const result = await db.query.settings.findFirst({
    where: and(
      eq(settings.key, "shopify_store_url"),
      eq(settings.value, shopDomain)
    ),
  });

  if (!result) return null;

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
    const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");

    // 1. Verify HMAC signature
    if (!hmacHeader || !verifyShopifyHmac(rawBody, hmacHeader)) {
      return NextResponse.json(
        { code: "WEBHOOK_001", message: "Invalid HMAC signature" },
        { status: 401 }
      );
    }

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
    const incomingOrder: IncomingOrder = {
      tenantId,
      marketplace: "shopify",
      externalOrderId: String(payload.id),
      orderNumber: String(payload.order_number ?? payload.id),
      customerName: shippingAddr.name ?? payload.email ?? "Unknown",
      customerEmail: payload.email ?? undefined,
      customerPhone: shippingAddr.phone ?? undefined,
      shippingAddress: shippingAddr,
      items: (payload.line_items ?? []).map((li: Record<string, unknown>) => ({
        sku: String(li.sku ?? ""),
        barcode: li.barcode ? String(li.barcode) : undefined,
        quantity: Number(li.quantity ?? 1),
        unitPrice: Number(li.price ?? 0),
        title: String(li.title ?? ""),
        size: li.variant_title ? String(li.variant_title) : undefined,
      })),
      totalAmount: Number(payload.total_price ?? 0),
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

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, settings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { processIncomingOrder } from "@/lib/order-processor";
import type { IncomingOrder } from "@/lib/order-processor";

// ─── TENANT LOOKUP ────────────────────────────────────────

async function findTenantByIdeasoft(storeUrl: string): Promise<number | null> {
  if (storeUrl) {
    const result = await db.query.settings.findFirst({
      where: and(
        eq(settings.key, "ideasoft_store_url"),
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

  // Fallback: find any tenant with ideasoft credentials
  const result = await db.query.settings.findFirst({
    where: eq(settings.key, "ideasoft_api_key"),
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
    const tenantId = await findTenantByIdeasoft(String(storeUrl));

    if (!tenantId) {
      return NextResponse.json(
        { code: "WEBHOOK_002", message: "Unknown IdeaSoft store" },
        { status: 404 }
      );
    }

    // 2. Parse IdeaSoft order payload
    const order = payload.order ?? payload;
    const shippingAddr = order.shippingAddress ?? order.shipping_address ?? order.address ?? {};

    const incomingOrder: IncomingOrder = {
      tenantId,
      marketplace: "ideasoft",
      externalOrderId: String(order.id ?? order.orderId ?? order.order_id ?? ""),
      orderNumber: String(
        order.orderNumber ?? order.order_number ?? order.orderNo ?? order.id ?? ""
      ),
      customerName:
        order.customerName ??
        order.customer_name ??
        (`${order.customerFirstName ?? order.firstName ?? shippingAddr.firstName ?? ""} ${order.customerLastName ?? order.lastName ?? shippingAddr.lastName ?? ""}`.trim() || "Unknown"),
      customerEmail: order.customerEmail ?? order.customer_email ?? order.email ?? undefined,
      customerPhone:
        order.customerPhone ?? order.customer_phone ?? order.phone ?? shippingAddr.phone ?? undefined,
      shippingAddress: shippingAddr,
      items: (
        (order.lineItems ?? order.line_items ?? order.items ?? order.products) as Record<string, unknown>[] ?? []
      ).map((li: Record<string, unknown>) => ({
        sku: String(li.sku ?? li.stockCode ?? ""),
        barcode: li.barcode ? String(li.barcode) : undefined,
        quantity: Number(li.quantity ?? 1),
        unitPrice: Number(li.unitPrice ?? li.unit_price ?? li.price ?? 0),
        title: String(li.title ?? li.name ?? li.productName ?? ""),
        size: li.variantTitle
          ? String(li.variantTitle)
          : li.variant_title
            ? String(li.variant_title)
            : li.optionValue
              ? String(li.optionValue)
              : undefined,
      })),
      totalAmount: Number(
        order.totalPrice ?? order.total_price ?? order.totalAmount ?? 0
      ),
      currency: order.currency ?? "TRY",
    };

    // 3. Process
    const result = await processIncomingOrder(incomingOrder);

    if (!result.success) {
      console.error("[WEBHOOK/IDEASOFT] Order processing failed:", result.error);
      return NextResponse.json(
        { code: "WEBHOOK_003", message: result.error },
        { status: 422 }
      );
    }

    return NextResponse.json({ ok: true, orderId: result.orderId });
  } catch (err) {
    console.error("[WEBHOOK/IDEASOFT] Unexpected error:", err);
    return NextResponse.json(
      { code: "WEBHOOK_500", message: "Internal server error" },
      { status: 500 }
    );
  }
}

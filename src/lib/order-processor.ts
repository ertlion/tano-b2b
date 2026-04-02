import { db } from "./db";
import { orders, masterVariants, stockMovements } from "./schema";
import { eq, or, and } from "drizzle-orm";
import { syncAllTenantsStock } from "./sync-engine";

// ─── TYPES ────────────────────────────────────────────────

export interface IncomingOrderItem {
  sku: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  title: string;
  size?: string;
}

export interface IncomingOrder {
  tenantId: number;
  marketplace: string;
  externalOrderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: Record<string, unknown>;
  items: IncomingOrderItem[];
  totalAmount: number;
  currency?: string;
}

interface ProcessResult {
  success: boolean;
  orderId?: number;
  error?: string;
}

// ─── PROCESSOR ────────────────────────────────────────────

export async function processIncomingOrder(order: IncomingOrder): Promise<ProcessResult> {
  try {
    // 1. Duplicate check (idempotency)
    const existing = await db.query.orders.findFirst({
      where: and(
        eq(orders.tenantId, order.tenantId),
        eq(orders.externalOrderId, order.externalOrderId)
      ),
    });

    if (existing) {
      return { success: true, orderId: existing.id, error: "duplicate" };
    }

    // 2. Match items to masterVariants and build order items
    const processedItems: Array<{
      masterVariantId: number;
      sku: string;
      barcode: string;
      title: string;
      size: string;
      quantity: number;
      unitPrice: number;
    }> = [];

    for (const item of order.items) {
      const variant = await findVariantBySkuOrBarcode(item.sku, item.barcode);

      if (!variant) {
        console.error(
          `[ORDER-PROCESSOR] Variant not found for SKU=${item.sku} barcode=${item.barcode ?? "N/A"}, order=${order.externalOrderId}`
        );
        continue;
      }

      processedItems.push({
        masterVariantId: variant.id,
        sku: variant.sku,
        barcode: variant.barcode,
        title: item.title,
        size: item.size ?? variant.size,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      });
    }

    if (processedItems.length === 0) {
      return { success: false, error: "No matching variants found for any line item" };
    }

    // 3. Decrease stock and log movements
    for (const item of processedItems) {
      const currentVariant = await db.query.masterVariants.findFirst({
        where: eq(masterVariants.id, item.masterVariantId),
      });

      if (!currentVariant) continue;

      const previousStock = currentVariant.stockQuantity;
      const newStock = Math.max(0, previousStock - item.quantity);

      await db
        .update(masterVariants)
        .set({
          stockQuantity: newStock,
          updatedAt: new Date(),
        })
        .where(eq(masterVariants.id, item.masterVariantId));

      await db.insert(stockMovements).values({
        masterVariantId: item.masterVariantId,
        type: "order",
        quantity: -item.quantity,
        previousStock,
        newStock,
        reference: `${order.marketplace}#${order.orderNumber}`,
      });
    }

    // 4. Create order record
    const [created] = await db
      .insert(orders)
      .values({
        tenantId: order.tenantId,
        orderNumber: order.orderNumber,
        externalOrderId: order.externalOrderId,
        customerName: order.customerName,
        customerEmail: order.customerEmail ?? null,
        customerPhone: order.customerPhone ?? null,
        shippingAddress: order.shippingAddress ?? null,
        items: processedItems.map((i) => ({
          sku: i.sku,
          barcode: i.barcode,
          title: i.title,
          size: i.size,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          masterVariantId: i.masterVariantId,
        })),
        totalAmount: String(order.totalAmount),
        currency: order.currency ?? "TRY",
        status: "new",
      })
      .returning({ id: orders.id });

    // 5. Fire-and-forget stock sync to all tenants
    syncAllTenantsStock().catch((err) => {
      console.error("[ORDER-PROCESSOR] syncAllTenantsStock failed:", err);
    });

    return { success: true, orderId: created.id };
  } catch (err) {
    console.error("[ORDER-PROCESSOR] Unexpected error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown processing error",
    };
  }
}

// ─── HELPERS ──────────────────────────────────────────────

async function findVariantBySkuOrBarcode(sku: string, barcode?: string) {
  const conditions = [eq(masterVariants.sku, sku)];
  if (barcode) {
    conditions.push(eq(masterVariants.barcode, barcode));
  }

  return db.query.masterVariants.findFirst({
    where: or(...conditions),
  });
}

import { db } from "./db";
import { orders, masterVariants, masterProducts, stockMovements, returns } from "./schema";
import { eq, and, sql } from "drizzle-orm";
import { syncAllTenantsStock } from "./sync-engine";
import { resolveByStoreSkuOrBarcode } from "./sku-mapping";
import { getUsdTryRate } from "./pricing";
import { deductBalance } from "./balance";

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
      usdPrice: number;
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
        usdPrice: Number(variant.usdPrice),
      });
    }

    if (processedItems.length === 0) {
      return { success: false, error: "No matching variants found for any line item" };
    }

    // 3. Check return history for matched variants
    const returnWarnings: string[] = [];
    for (const item of processedItems) {
      const returnRecord = await db.query.returns.findFirst({
        where: and(
          eq(returns.tenantId, order.tenantId),
          eq(returns.masterVariantId, item.masterVariantId)
        ),
      });
      if (returnRecord) {
        returnWarnings.push(
          `Iade gecmisi: ${item.title} - ${item.size}`
        );
      }
    }

    const requiresReview = returnWarnings.length > 0;

    // 4. If no return history, decrease stock atomically (tek havuz - Epic B).
    // Atomik UPDATE ile race condition / overselling önlenir.
    let stockApplied = false;
    if (!requiresReview) {
      for (const item of processedItems) {
        // Ledger için mevcut stok (gösterim amaçlı); gerçek düşüm atomiktir.
        const current = await db.query.masterVariants.findFirst({
          where: eq(masterVariants.id, item.masterVariantId),
          columns: { stockQuantity: true },
        });
        const previousStock = current?.stockQuantity ?? 0;

        // Atomik düşüm — canlı DB değerini kullanır, overselling önler.
        const [updated] = await db
          .update(masterVariants)
          .set({
            stockQuantity: sql`GREATEST(0, ${masterVariants.stockQuantity} - ${item.quantity})`,
            updatedAt: new Date(),
          })
          .where(eq(masterVariants.id, item.masterVariantId))
          .returning({ newStock: masterVariants.stockQuantity });

        if (!updated) continue;

        await db.insert(stockMovements).values({
          masterVariantId: item.masterVariantId,
          type: "order",
          quantity: -item.quantity,
          previousStock,
          newStock: updated.newStock,
          reference: `${order.marketplace}#${order.orderNumber}`,
        });
      }
      stockApplied = true;
    }

    // 4b. Ürün bakiyesinden B2B maliyeti düş (Epic E). Sipariş geldiğinde,
    // toptan maliyet = Σ usdPrice × kur × adet. Yetersizse bile düşer (borç oluşur).
    let balanceCharged = 0;
    if (!requiresReview) {
      const rate = await getUsdTryRate();
      balanceCharged =
        Math.round(
          processedItems.reduce((sum, it) => sum + it.usdPrice * rate * it.quantity, 0) * 100
        ) / 100;
      if (balanceCharged > 0) {
        await deductBalance(order.tenantId, "product", balanceCharged, "order", {
          reference: `${order.marketplace}#${order.orderNumber}`,
          force: true,
        });
      }
    }

    // 5. Create order record
    const orderNotes = requiresReview
      ? `[REVIEW GEREKLI] ${returnWarnings.join("; ")}`
      : null;

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
        status: requiresReview ? "pending_review" : "bekleniyor",
        stockApplied,
        balanceCharged: String(balanceCharged),
        notes: orderNotes,
      })
      .returning({ id: orders.id });

    // 6. Fire-and-forget stock sync to all tenants
    syncAllTenantsStock().catch((err) => {
      console.error("[ORDER-PROCESSOR] syncAllTenantsStock failed:", err);
    });

    // 7. Telegram bildirimi (Epic I) — yeni sipariş
    import("./telegram")
      .then(({ notifyTenant }) =>
        notifyTenant(order.tenantId, "order", {
          text: `🛒 Yeni sipariş: <b>${order.orderNumber}</b> (${order.marketplace})\nMüşteri: ${order.customerName}\nTutar: ${order.totalAmount} ${order.currency ?? "TRY"}`,
        })
      )
      .catch(() => {});

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
  // 0. Epic J: mağaza bazlı store SKU/barkod ile ters eşleme (öncelikli).
  // Siparişler artık her mağazaya özel benzersiz SKU/barkod ile gelir.
  for (const code of [sku, barcode]) {
    if (!code) continue;
    const resolved = await resolveByStoreSkuOrBarcode(code);
    if (resolved) {
      const v = await db.query.masterVariants.findFirst({
        where: eq(masterVariants.id, resolved.masterVariantId),
      });
      if (v) return v;
    }
  }

  // 1. Exact SKU match (legacy / ikas master SKU)
  const bySku = await db.query.masterVariants.findFirst({
    where: eq(masterVariants.sku, sku),
  });
  if (bySku) return bySku;

  // 2. Exact barcode match
  if (barcode) {
    const byBarcode = await db.query.masterVariants.findFirst({
      where: eq(masterVariants.barcode, barcode),
    });
    if (byBarcode) return byBarcode;
  }

  // 3. Shopify SKU format: "{productSku}-{variantName}" e.g. "202146-GRİ"
  // Split on first dash and try to match by product SKU + color/size
  const dashIndex = sku.indexOf("-");
  if (dashIndex > 0) {
    const productSku = sku.substring(0, dashIndex);
    const variantName = sku.substring(dashIndex + 1).trim();

    // Find the master product
    const product = await db.query.masterProducts.findFirst({
      where: eq(masterProducts.sku, productSku),
      columns: { id: true },
    });

    if (product) {
      // Try matching variant by color or size
      const variants = await db.query.masterVariants.findMany({
        where: eq(masterVariants.masterProductId, product.id),
      });

      // Match by color
      const byColor = variants.find(
        (v) => v.color?.toUpperCase() === variantName.toUpperCase()
      );
      if (byColor) return byColor;

      // Match by size
      const bySize = variants.find(
        (v) => v.size.toUpperCase() === variantName.toUpperCase()
      );
      if (bySize) return bySize;

      // Match by "color / size" format e.g. "GRİ / M"
      const byColorSize = variants.find((v) => {
        const combined = [v.color, v.size !== "STD" ? v.size : null].filter(Boolean).join(" / ").toUpperCase();
        return combined === variantName.toUpperCase();
      });
      if (byColorSize) return byColorSize;
    }
  }

  return null;
}

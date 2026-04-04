import { db } from "./db";
import { settings, masterVariants } from "./schema";
import { eq } from "drizzle-orm";
import { processIncomingOrder } from "./order-processor";
import type { IncomingOrder, IncomingOrderItem } from "./order-processor";

// ─── TYPES ────────────────────────────────────────────────

export interface TrendyolConfig {
  supplierId: string;
  apiKey: string;
  apiSecret: string;
}

interface TrendyolOrderLine {
  barcode: string;
  quantity: number;
  price: number;
  productName: string;
  productSize?: string;
  merchantSku?: string;
}

interface TrendyolOrder {
  orderNumber: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail?: string;
  totalPrice: number;
  lines: TrendyolOrderLine[];
  shipmentAddress?: {
    address1?: string;
    city?: string;
    district?: string;
    postalCode?: string;
    fullName?: string;
    phone?: string;
  };
}

// ─── HELPERS ──────────────────────────────────────────────

const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";

function getAuthHeader(apiKey: string, apiSecret: string): string {
  return "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
}

// ─── FETCH ORDERS ─────────────────────────────────────────

export async function fetchTrendyolOrders(
  tenantId: number,
  config: TrendyolConfig
): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const result = { processed: 0, skipped: 0, errors: [] as string[] };

  try {
    // Fetch last 24 hours (Trendyol uses unix timestamps in milliseconds)
    const endDate = Date.now();
    const startDate = endDate - 24 * 60 * 60 * 1000;

    const url = `${TRENDYOL_BASE_URL}/suppliers/${config.supplierId}/orders?startDate=${startDate}&endDate=${endDate}&status=Created&page=0&size=200`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: getAuthHeader(config.apiKey, config.apiSecret),
        "User-Agent": `${config.supplierId} - SelfIntegration`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      result.errors.push(`Trendyol API hatasi: ${res.status} - ${err}`);
      return result;
    }

    const data = await res.json();
    const trendyolOrders: TrendyolOrder[] = data?.content || [];

    for (const tOrder of trendyolOrders) {
      try {
        // Filter items that match our variants (by barcode)
        const matchedItems: IncomingOrderItem[] = [];

        for (const line of tOrder.lines) {
          const variant = await db.query.masterVariants.findFirst({
            where: eq(masterVariants.barcode, line.barcode),
          });

          if (variant) {
            matchedItems.push({
              sku: variant.sku,
              barcode: line.barcode,
              quantity: line.quantity,
              unitPrice: line.price,
              title: line.productName,
              size: line.productSize ?? variant.size,
            });
          }
        }

        if (matchedItems.length === 0) {
          result.skipped++;
          continue;
        }

        const incomingOrder: IncomingOrder = {
          tenantId,
          marketplace: "trendyol",
          externalOrderId: `trendyol-${tOrder.orderNumber}`,
          orderNumber: String(tOrder.orderNumber),
          customerName: `${tOrder.customerFirstName} ${tOrder.customerLastName}`.trim(),
          customerEmail: tOrder.customerEmail,
          customerPhone: tOrder.shipmentAddress?.phone,
          shippingAddress: tOrder.shipmentAddress
            ? {
                address: tOrder.shipmentAddress.address1,
                city: tOrder.shipmentAddress.city,
                district: tOrder.shipmentAddress.district,
                postalCode: tOrder.shipmentAddress.postalCode,
                fullName: tOrder.shipmentAddress.fullName,
              }
            : undefined,
          items: matchedItems,
          totalAmount: matchedItems.reduce(
            (sum, i) => sum + i.unitPrice * i.quantity,
            0
          ),
          currency: "TRY",
        };

        const processResult = await processIncomingOrder(incomingOrder);

        if (processResult.success) {
          if (processResult.error === "duplicate") {
            result.skipped++;
          } else {
            result.processed++;
          }
        } else {
          result.errors.push(
            `Siparis ${tOrder.orderNumber}: ${processResult.error}`
          );
        }
      } catch (err) {
        result.errors.push(
          `Siparis ${tOrder.orderNumber}: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `Trendyol siparis cekme hatasi: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`
    );
  }

  return result;
}

// ─── GET CONFIG FROM SETTINGS ─────────────────────────────

export async function getTrendyolConfig(
  tenantId: number
): Promise<TrendyolConfig | null> {
  const tenantSettings = await db.query.settings.findMany({
    where: eq(settings.tenantId, tenantId),
  });

  const settingsMap = new Map<string, string>();
  for (const s of tenantSettings) {
    settingsMap.set(s.key, s.value);
  }

  const supplierId = settingsMap.get("trendyol_supplier_id");
  const apiKey = settingsMap.get("trendyol_api_key");
  const apiSecret = settingsMap.get("trendyol_api_secret");

  if (!supplierId || !apiKey || !apiSecret) {
    return null;
  }

  return { supplierId, apiKey, apiSecret };
}

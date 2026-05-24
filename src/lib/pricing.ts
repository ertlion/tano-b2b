import { db } from "./db";
import { appConfig, tenants, tenantVariantPrices } from "./schema";
import { eq, and, inArray } from "drizzle-orm";

// ─── Fiyatlandırma (USD B2B → TL) ──────────────────────────────
//
// Temel: master_variants.usdPrice (ikas "Dolar B2B" USD).
// TL temel = usdPrice × usd_try_rate (admin belirler, app_config).
// Üye fiyatı:
//   - manuel: tenant_variant_prices.manualPriceTry (TL doğrudan)
//   - yüzde:  tabanTL × (1 + percent/100)
//   - override yoksa: tenants.default_markup_percent uygulanır.

export async function getUsdTryRate(): Promise<number> {
  const row = await db.query.appConfig.findFirst({
    where: eq(appConfig.key, "usd_try_rate"),
  });
  const r = Number(row?.value);
  return r > 0 ? r : 1;
}

export interface PriceOverride {
  mode: string; // 'percent' | 'manual'
  percent: number | null;
  manualPriceTry: number | null;
}

/**
 * Tek varyant için üyenin TL satış fiyatını hesapla.
 */
export function computeVariantPriceTRY(
  usdPrice: number,
  rate: number,
  defaultMarkupPercent: number,
  override?: PriceOverride | null
): number {
  if (override?.mode === "manual" && override.manualPriceTry != null) {
    return round2(Number(override.manualPriceTry));
  }
  const baseTry = usdPrice * rate;
  const pct =
    override?.mode === "percent" && override.percent != null
      ? Number(override.percent)
      : defaultMarkupPercent;
  return round2(baseTry * (1 + pct / 100));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ComputedVariantPrice {
  priceTry: number; // üye satış fiyatı (TL)
  baseTry: number; // taban maliyet (usd × kur)
  usdPrice: number;
}

/**
 * Bir üye için verilen master varyantların TL fiyatlarını toplu hesapla.
 * Push ve panel listeleri için kullanılır.
 */
export async function getTenantVariantPrices(
  tenantId: number,
  variants: Array<{ id: number; usdPrice: number }>
): Promise<Map<number, ComputedVariantPrice>> {
  const result = new Map<number, ComputedVariantPrice>();
  if (variants.length === 0) return result;

  const rate = await getUsdTryRate();
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { defaultMarkupPercent: true },
  });
  const defaultMarkup = Number(tenant?.defaultMarkupPercent) || 0;

  const overrides = await db.query.tenantVariantPrices.findMany({
    where: and(
      eq(tenantVariantPrices.tenantId, tenantId),
      inArray(
        tenantVariantPrices.masterVariantId,
        variants.map((v) => v.id)
      )
    ),
  });
  const ovMap = new Map(overrides.map((o) => [o.masterVariantId, o]));

  for (const v of variants) {
    const usd = Number(v.usdPrice) || 0;
    const ov = ovMap.get(v.id);
    const override = ov
      ? {
          mode: ov.mode,
          percent: ov.percent != null ? Number(ov.percent) : null,
          manualPriceTry: ov.manualPriceTry != null ? Number(ov.manualPriceTry) : null,
        }
      : null;
    result.set(v.id, {
      priceTry: computeVariantPriceTRY(usd, rate, defaultMarkup, override),
      baseTry: round2(usd * rate),
      usdPrice: usd,
    });
  }
  return result;
}

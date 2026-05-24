import { db } from "./db";
import { tenantVariantSkus } from "./schema";
import { and, eq, inArray } from "drizzle-orm";
import type { MarketplaceName } from "./marketplace/types";

// ─── Mağaza Bazlı SKU / Barkod Eşleme (Epic J) ─────────────────
//
// Her (tenant, master_variant, kanal) için benzersiz store_sku + store_barcode.
// Amaç:
//   1. Pazaryerlerinde aynı ürünler birbiriyle eşleşmesin (buybox/birleştirme engellensin)
//   2. Sipariş gelince store SKU/barkod → master varyant ters eşleme yapılabilsin
//
// Üretim deterministik ve global benzersizdir; (tenant, varyant, kanal) üçlüsü tekildir.

// Kanal → tek haneli kod (barkod içine gömmek için). Yeni kanal eklenince buraya ekle.
// (Ticimax Faz 3'te MarketplaceName union'a eklendiğinde kod 6 olarak buraya gelir.)
const MARKETPLACE_CODE: Record<MarketplaceName, number> = {
  ikas: 1,
  shopify: 2,
  trendyol: 3,
  tsoft: 4,
  ideasoft: 5,
};

/**
 * Deterministik, okunabilir store SKU.
 * Format: TT-<tenantId>-<mpCode>-<masterVariantId>
 * (tenant, varyant, kanal) tekil olduğu için global benzersizdir.
 */
export function buildStoreSku(
  tenantId: number,
  marketplace: MarketplaceName,
  masterVariantId: number
): string {
  const mp = MARKETPLACE_CODE[marketplace] ?? 0;
  return `TT-${tenantId}-${mp}-${masterVariantId}`;
}

/**
 * EAN-13 check digit hesapla (son hane).
 */
function ean13CheckDigit(twelve: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = twelve.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Deterministik, geçerli EAN-13 store barkodu.
 * 12 veri hanesi: <tenant:4><variant:6><mp:1><spare:1> + check digit.
 * tenantId < 10000 ve masterVariantId < 1_000_000 olduğu sürece benzersiz.
 */
export function buildStoreBarcode(
  tenantId: number,
  marketplace: MarketplaceName,
  masterVariantId: number
): string {
  if (tenantId >= 10000 || masterVariantId >= 1_000_000) {
    throw new Error(
      `Store barkod üretilemiyor: tenantId(${tenantId}) veya variantId(${masterVariantId}) kapasite dışı`
    );
  }
  const mp = MARKETPLACE_CODE[marketplace] ?? 0;
  const twelve =
    String(tenantId).padStart(4, "0") +
    String(masterVariantId).padStart(6, "0") +
    String(mp) +
    "0";
  return twelve + String(ean13CheckDigit(twelve));
}

export interface VariantSkuMapping {
  masterVariantId: number;
  storeSku: string;
  storeBarcode: string;
}

/**
 * Bir push öncesi: verilen master varyantlar için (tenant, kanal) eşlemelerini
 * oluştur (yoksa) ve hepsini döndür. Idempotent — varsa mevcut kaydı korur.
 */
export async function ensureVariantSkuMappings(
  tenantId: number,
  marketplace: MarketplaceName,
  masterVariantIds: number[]
): Promise<Map<number, VariantSkuMapping>> {
  const result = new Map<number, VariantSkuMapping>();
  if (masterVariantIds.length === 0) return result;

  const existing = await db.query.tenantVariantSkus.findMany({
    where: and(
      eq(tenantVariantSkus.tenantId, tenantId),
      eq(tenantVariantSkus.marketplace, marketplace),
      inArray(tenantVariantSkus.masterVariantId, masterVariantIds)
    ),
  });

  for (const row of existing) {
    result.set(row.masterVariantId, {
      masterVariantId: row.masterVariantId,
      storeSku: row.storeSku,
      storeBarcode: row.storeBarcode,
    });
  }

  const missing = masterVariantIds.filter((id) => !result.has(id));
  if (missing.length > 0) {
    const rows = missing.map((id) => ({
      tenantId,
      masterVariantId: id,
      marketplace,
      storeSku: buildStoreSku(tenantId, marketplace, id),
      storeBarcode: buildStoreBarcode(tenantId, marketplace, id),
    }));

    await db
      .insert(tenantVariantSkus)
      .values(rows)
      .onConflictDoNothing({
        target: [
          tenantVariantSkus.tenantId,
          tenantVariantSkus.masterVariantId,
          tenantVariantSkus.marketplace,
        ],
      });

    for (const r of rows) {
      result.set(r.masterVariantId, {
        masterVariantId: r.masterVariantId,
        storeSku: r.storeSku,
        storeBarcode: r.storeBarcode,
      });
    }
  }

  return result;
}

/**
 * Push başarılı olunca pazaryeri dış ID'lerini eşleme tablosuna kaydet.
 * variantExternalIds: { [masterVariantId]: externalVariantId }
 */
export async function saveExternalIdsForMappings(
  tenantId: number,
  marketplace: MarketplaceName,
  externalProductId: string | null,
  variantExternalIds: Record<number, string>
): Promise<void> {
  const entries = Object.entries(variantExternalIds);
  for (const [variantIdStr, externalVariantId] of entries) {
    const masterVariantId = Number(variantIdStr);
    await db
      .update(tenantVariantSkus)
      .set({ externalProductId, externalVariantId, updatedAt: new Date() })
      .where(
        and(
          eq(tenantVariantSkus.tenantId, tenantId),
          eq(tenantVariantSkus.marketplace, marketplace),
          eq(tenantVariantSkus.masterVariantId, masterVariantId)
        )
      );
  }
}

export interface ResolvedVariant {
  tenantId: number;
  masterVariantId: number;
  marketplace: string;
  storeSku: string;
  storeBarcode: string;
}

/**
 * Sipariş ters eşleme: gelen store SKU veya barkoddan master varyantı çöz.
 * Sipariş kalemi hangi mağaza/üyeye aitse onu da döndürür.
 */
export async function resolveByStoreSkuOrBarcode(
  code: string
): Promise<ResolvedVariant | null> {
  if (!code) return null;

  let row = await db.query.tenantVariantSkus.findFirst({
    where: eq(tenantVariantSkus.storeSku, code),
  });
  if (!row) {
    row = await db.query.tenantVariantSkus.findFirst({
      where: eq(tenantVariantSkus.storeBarcode, code),
    });
  }
  if (!row) return null;

  return {
    tenantId: row.tenantId,
    masterVariantId: row.masterVariantId,
    marketplace: row.marketplace,
    storeSku: row.storeSku,
    storeBarcode: row.storeBarcode,
  };
}

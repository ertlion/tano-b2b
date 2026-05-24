import { db } from "./db";
import { masterProducts, masterVariants, stockMovements, syncLogs, ikasSyncState, appConfig } from "./schema";
import { eq, and } from "drizzle-orm";
import { IkasAdapter } from "./marketplace/adapters/ikas.adapter";
import type { IkasFetchedProduct } from "./marketplace/adapters/ikas.adapter";
import type { MarketplaceCredentials } from "./marketplace/types";
import { syncAllTenantsStock } from "./sync-engine";

// ─── ikas Master Stok Entegrasyonu (Epic A) ────────────────────
//
// ateliertano.com (ikas Private App) sistemin TEK master ürün/stok kaynağıdır.
// Bu modül ikas'tan ürünleri çeker, master_products/master_variants'a upsert eder
// (source=ikas, external_id eşleme) ve stok değişimini tüm kanallara yayar.

interface IkasMasterCredentials extends MarketplaceCredentials {
  marketplace: "ikas";
  ikas_store_url: string;
  ikas_api_key: string;
  ikas_api_secret: string;
  ikas_access_token?: string;
}

/**
 * Master ikas (ateliertano) credential'ları. İki model desteklenir:
 *  1) Private App (client_credentials): IKAS_MASTER_API_KEY + IKAS_MASTER_API_SECRET
 *  2) OAuth (authorization_code): önceden alınmış IKAS_MASTER_ACCESS_TOKEN
 *     (adapter token'ı doğrudan kullanır, oauth/token adımını atlar)
 */
export function getMasterIkasCredentials(): IkasMasterCredentials | null {
  const store = process.env.IKAS_MASTER_STORE_URL || "ateliertano";
  const accessToken = process.env.IKAS_MASTER_ACCESS_TOKEN;
  const key = process.env.IKAS_MASTER_API_KEY;
  const secret = process.env.IKAS_MASTER_API_SECRET;

  // OAuth: hazır access token varsa onu kullan
  if (accessToken) {
    return {
      marketplace: "ikas",
      ikas_store_url: store,
      ikas_api_key: key || "",
      ikas_api_secret: secret || "",
      ikas_access_token: accessToken,
    };
  }

  // Private App: client_credentials
  if (key && secret) {
    return {
      marketplace: "ikas",
      ikas_store_url: store,
      ikas_api_key: key,
      ikas_api_secret: secret,
    };
  }

  return null;
}

function deterministicBarcode(v: { barcode: string; sku: string; externalId: string }): string {
  // NOT: ikas'ta sku varyantlar arasında paylaşımlı olabilir; fallback'te sku
  // KULLANMA (unique barcode çakışır). Barkod yoksa varyant id'sine düş.
  return v.barcode || `IKAS-V-${v.externalId}`;
}

interface SyncSummary {
  productsUpserted: number;
  variantsUpserted: number;
  stockChanges: number;
  errors: string[];
}

/**
 * ikas'tan tüm kataloğu çekip master tablolara upsert eder.
 */
export async function syncMasterCatalogFromIkas(): Promise<SyncSummary> {
  const summary: SyncSummary = {
    productsUpserted: 0,
    variantsUpserted: 0,
    stockChanges: 0,
    errors: [],
  };

  const creds = getMasterIkasCredentials();
  if (!creds) {
    summary.errors.push("IKAS_MASTER_* env değişkenleri tanımlı değil");
    await recordSyncLog("error", summary);
    return summary;
  }

  const adapter = new IkasAdapter();
  const b2bPriceListId =
    (await getConfig("ikas_b2b_price_list_id")) ||
    process.env.IKAS_B2B_PRICE_LIST_ID ||
    undefined;
  let page = 1;
  let hasNext = true;

  try {
    while (hasNext) {
      const { products, hasNext: next } = await adapter.fetchProducts(creds, page, 50, b2bPriceListId);
      for (const p of products) {
        try {
          await upsertProduct(p, summary);
        } catch (err) {
          summary.errors.push(
            `Ürün ${p.externalId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      hasNext = next;
      page += 1;
      if (page > 1000) break; // güvenlik freni
    }

    await setSyncState("last_full_sync", new Date().toISOString());
    await recordSyncLog(summary.errors.length === 0 ? "success" : "partial", summary);

    // Stok değiştiyse tüm tenant kanallarına yay (Epic B)
    if (summary.stockChanges > 0) {
      syncAllTenantsStock().catch((e) =>
        console.error("[IKAS-MASTER-SYNC] propagate failed:", e)
      );
    }
  } catch (err) {
    summary.errors.push(err instanceof Error ? err.message : String(err));
    await recordSyncLog("error", summary);
  }

  return summary;
}

async function upsertProduct(p: IkasFetchedProduct, summary: SyncSummary): Promise<void> {
  const sku = `IKAS-${p.externalId}`;

  const existing = await db.query.masterProducts.findFirst({
    where: eq(masterProducts.externalId, p.externalId),
  });

  let productId: number;
  if (existing) {
    await db
      .update(masterProducts)
      .set({
        name: p.name || existing.name,
        description: p.description,
        source: "ikas",
        updatedAt: new Date(),
      })
      .where(eq(masterProducts.id, existing.id));
    productId = existing.id;
  } else {
    const [created] = await db
      .insert(masterProducts)
      .values({
        sku,
        externalId: p.externalId,
        name: p.name || sku,
        description: p.description,
        source: "ikas",
        status: "active",
      })
      .returning({ id: masterProducts.id });
    productId = created.id;
  }
  summary.productsUpserted += 1;

  for (const v of p.variants) {
    const barcode = deterministicBarcode(v);
    const variantSku = v.sku || `IKAS-V-${v.externalId}`;
    const size = v.size || "STD";

    const existingVariant = await db.query.masterVariants.findFirst({
      where: and(
        eq(masterVariants.masterProductId, productId),
        eq(masterVariants.externalId, v.externalId)
      ),
    });

    if (existingVariant) {
      if (existingVariant.stockQuantity !== v.stockQuantity) {
        await db.insert(stockMovements).values({
          masterVariantId: existingVariant.id,
          type: "ikas_sync",
          quantity: v.stockQuantity - existingVariant.stockQuantity,
          previousStock: existingVariant.stockQuantity,
          newStock: v.stockQuantity,
          reference: `ikas#${p.externalId}`,
        });
        summary.stockChanges += 1;
      }
      await db
        .update(masterVariants)
        .set({
          color: v.color,
          size,
          stockQuantity: v.stockQuantity,
          costPrice: String(v.costPrice),
          salePrice: String(v.salePrice),
          usdPrice: String(v.usdPrice),
          updatedAt: new Date(),
        })
        .where(eq(masterVariants.id, existingVariant.id));
    } else {
      await db.insert(masterVariants).values({
        masterProductId: productId,
        externalId: v.externalId,
        color: v.color,
        size,
        barcode,
        sku: variantSku,
        stockQuantity: v.stockQuantity,
        costPrice: String(v.costPrice),
        salePrice: String(v.salePrice),
        usdPrice: String(v.usdPrice),
      });
      summary.stockChanges += 1;
    }
    summary.variantsUpserted += 1;
  }
}

/**
 * ikas stok webhook'u için: dış varyant ID'sinden master stoğu mutlak olarak set et,
 * sonra tüm kanallara yay.
 */
export async function applyIkasStockUpdate(
  externalVariantId: string,
  newStock: number
): Promise<boolean> {
  const variant = await db.query.masterVariants.findFirst({
    where: eq(masterVariants.externalId, externalVariantId),
  });
  if (!variant) return false;

  if (variant.stockQuantity !== newStock) {
    await db.insert(stockMovements).values({
      masterVariantId: variant.id,
      type: "ikas_sync",
      quantity: newStock - variant.stockQuantity,
      previousStock: variant.stockQuantity,
      newStock,
      reference: `ikas-webhook#${externalVariantId}`,
    });
    await db
      .update(masterVariants)
      .set({ stockQuantity: newStock, updatedAt: new Date() })
      .where(eq(masterVariants.id, variant.id));

    syncAllTenantsStock().catch((e) =>
      console.error("[IKAS-MASTER-SYNC] webhook propagate failed:", e)
    );
  }
  return true;
}

async function getConfig(key: string): Promise<string | null> {
  const row = await db.query.appConfig.findFirst({ where: eq(appConfig.key, key) });
  return row?.value ?? null;
}

async function setSyncState(key: string, value: string): Promise<void> {
  await db
    .insert(ikasSyncState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: ikasSyncState.key,
      set: { value, updatedAt: new Date() },
    });
}

async function recordSyncLog(
  status: "success" | "error" | "partial",
  summary: SyncSummary
): Promise<void> {
  await db.insert(syncLogs).values({
    tenantId: null,
    type: "ikas_master_sync",
    status,
    details: summary,
  });
}

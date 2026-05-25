import { db } from "./db";
import { masterProducts, masterVariants, stockMovements, syncLogs, ikasSyncState, appConfig } from "./schema";
import { eq, and, sql } from "drizzle-orm";
import { IkasAdapter } from "./marketplace/adapters/ikas.adapter";
import type { IkasFetchedProduct } from "./marketplace/adapters/ikas.adapter";
import type { MarketplaceCredentials } from "./marketplace/types";
import { syncAllTenantsStock } from "./sync-engine";
import { getConfigValues } from "./app-config";

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
 * Master ikas (ateliertano) credential'ları (admin panel / app_config → env).
 *  1) Private App (client_credentials): ikas_master_api_key + ikas_master_api_secret
 *  2) OAuth: önceden alınmış ikas_master_access_token (adapter doğrudan kullanır)
 */
export async function getMasterIkasCredentials(): Promise<IkasMasterCredentials | null> {
  const c = await getConfigValues([
    "ikas_master_store_url",
    "ikas_master_access_token",
    "ikas_master_api_key",
    "ikas_master_api_secret",
  ]);
  const store = c.ikas_master_store_url || "ateliertano";
  const accessToken = c.ikas_master_access_token;
  const key = c.ikas_master_api_key;
  const secret = c.ikas_master_api_secret;

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
  deactivated: number;
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
    deactivated: 0,
    errors: [],
  };
  // Bu sync'te güncellenmeyen ikas ürünlerini bulmak için başlangıç zamanı.
  const syncStart = new Date();

  const creds = await getMasterIkasCredentials();
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
  let completedFully = false;

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
    completedFully = !hasNext; // döngü hasNext=false ile bittiyse eksiksiz

    // ikas'ta artık olmayan (bu sync'te güncellenmeyen) ürünleri pasifle.
    // SADECE eksiksiz ve anlamlı bir sync olduysa — yoksa ağ hatasında hepsi pasifleşmesin.
    if (completedFully && summary.productsUpserted > 0) {
      summary.deactivated = await deactivateMissingIkasProducts(syncStart);
    }

    await setSyncState("last_full_sync", new Date().toISOString());
    await recordSyncLog(summary.errors.length === 0 ? "success" : "partial", summary);

    // Stok değiştiyse / ürün pasifleştiyse tüm tenant kanallarına yay (Epic B)
    if (summary.stockChanges > 0 || summary.deactivated > 0) {
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
        images: p.images ?? [],
        source: "ikas",
        status: "active", // ikas'ta tekrar görülürse yeniden aktifleştir
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
        images: p.images ?? [],
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
          images: v.images ?? [],
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
        images: v.images ?? [],
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

/**
 * Bu sync'te güncellenmeyen (ikas'tan artık gelmeyen = silinmiş) ikas ürünlerini
 * pasifleştir (status='passive') ve varyant stoklarını 0'a çek (kanallardan düşsün).
 * before: sync başlangıç zamanı; updated_at < before olanlar bu turda görülmedi demektir.
 */
async function deactivateMissingIkasProducts(before: Date): Promise<number> {
  const ts = before.toISOString();
  // Önce stokları 0'la (kanal senkronu 0 yazsın)
  await db.execute(sql`
    UPDATE master_variants SET stock_quantity = 0, updated_at = now()
    WHERE stock_quantity <> 0 AND master_product_id IN (
      SELECT id FROM master_products WHERE source = 'ikas' AND status = 'active' AND updated_at < ${ts}::timestamp
    )`);
  // Ürünleri pasifle
  const res = await db.execute<{ id: number }>(sql`
    UPDATE master_products SET status = 'passive', updated_at = now()
    WHERE source = 'ikas' AND status = 'active' AND updated_at < ${ts}::timestamp
    RETURNING id`);
  // postgres-js: execute sonucu satır dizisi döner
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = res as unknown as any[];
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * ikas-dışı (eski) master ürünleri ve bağımlı kayıtlarını siler.
 * FK sırasına göre. Master katalog SADECE ikas'tan gelecek (kullanıcı kararı).
 */
export async function purgeNonIkasProducts(): Promise<{ deletedProducts: number }> {
  const PSEL = sql`(SELECT id FROM master_products WHERE source <> 'ikas')`;
  const VSEL = sql`(SELECT id FROM master_variants WHERE master_product_id IN ${PSEL})`;

  // Önce sayalım (rapor için)
  const [{ cnt }] = await db.execute<{ cnt: number }>(
    sql`SELECT count(*)::int AS cnt FROM master_products WHERE source <> 'ikas'`
  );

  // Bağımlı kayıtlar (varyant bazlı)
  await db.execute(sql`DELETE FROM tenant_variant_skus WHERE master_variant_id IN ${VSEL}`);
  await db.execute(sql`DELETE FROM tenant_variant_prices WHERE master_variant_id IN ${VSEL}`);
  await db.execute(sql`DELETE FROM stock_movements WHERE master_variant_id IN ${VSEL}`);
  await db.execute(sql`DELETE FROM returns WHERE master_variant_id IN ${VSEL}`);
  // Ürün bazlı
  await db.execute(sql`DELETE FROM generated_images WHERE master_product_id IN ${PSEL}`);
  await db.execute(sql`DELETE FROM ai_image_jobs WHERE master_product_id IN ${PSEL}`);
  await db.execute(sql`DELETE FROM tenant_products WHERE master_product_id IN ${PSEL}`);
  await db.execute(sql`DELETE FROM tenant_product_permissions WHERE master_product_id IN ${PSEL}`);
  // Son: varyantlar, sonra ürünler
  await db.execute(sql`DELETE FROM master_variants WHERE master_product_id IN (SELECT id FROM master_products WHERE source <> 'ikas')`);
  await db.execute(sql`DELETE FROM master_products WHERE source <> 'ikas'`);

  return { deletedProducts: Number(cnt) || 0 };
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

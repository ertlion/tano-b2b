import { db } from "./db";
import { tenants, tenantProducts, masterVariants, masterProducts, syncLogs } from "./schema";
import { eq, and } from "drizzle-orm";
import { getAdapter } from "./marketplace/registry";
import { resolveCredentials } from "./marketplace/credential-resolver";
import { getTenantSetting } from "./tenant-settings";
import type { MarketplaceName } from "./marketplace/types";
import { ensureVariantSkuMappings, saveExternalIdsForMappings } from "./sku-mapping";
import { getTenantVariantPrices } from "./pricing";

export const PUSH_IMAGES_SETTING_KEY = "push_images_enabled";

async function tenantPushesImages(tenantId: number): Promise<boolean> {
  const val = await getTenantSetting(tenantId, PUSH_IMAGES_SETTING_KEY);
  return val === "true";
}

function collectImages(
  variants: Array<{ images?: string[] }>,
  masterImages: string[]
): { images: string[]; coverImage: string } {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    for (const url of v.images ?? []) {
      if (url && !seen.has(url)) {
        seen.add(url);
        out.push(url);
      }
    }
  }
  for (const url of masterImages) {
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return { images: out, coverImage: out[0] || "" };
}

/**
 * Sync stock for ALL active tenants.
 * Called after every stock change (excel import, order, manual update).
 */
export async function syncAllTenantsStock(): Promise<{
  totalTenants: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ tenantId: number; error: string }>;
}> {
  const activeTenants = await db.query.tenants.findMany({
    where: and(eq(tenants.isActive, true), eq(tenants.isApproved, true)),
  });

  const nonAdminTenants = activeTenants.filter((t) => !t.isAdmin);

  const result = {
    totalTenants: nonAdminTenants.length,
    successCount: 0,
    errorCount: 0,
    errors: [] as Array<{ tenantId: number; error: string }>,
  };

  const syncPromises = nonAdminTenants
    .map(async (tenant) => {
      try {
        await syncTenantStock(tenant.id, tenant.marketplace as MarketplaceName);
        result.successCount++;
      } catch (err) {
        result.errorCount++;
        result.errors.push({
          tenantId: tenant.id,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });

  await Promise.allSettled(syncPromises);

  await db.insert(syncLogs).values({
    tenantId: null,
    type: "stock_sync",
    status: result.errorCount === 0 ? "success" : result.errors.length === result.totalTenants ? "error" : "partial",
    details: result,
  });

  return result;
}

/**
 * Sync stock for a single tenant's active marketplace listings.
 */
async function syncTenantStock(
  tenantId: number,
  marketplace: MarketplaceName
): Promise<void> {
  const credentials = await resolveCredentials(tenantId, marketplace);
  if (!credentials) {
    throw new Error(`No credentials found for tenant ${tenantId} marketplace ${marketplace}`);
  }

  const adapter = getAdapter(marketplace);

  const activeListings = await db.query.tenantProducts.findMany({
    where: and(
      eq(tenantProducts.tenantId, tenantId),
      eq(tenantProducts.status, "active")
    ),
  });

  for (const listing of activeListings) {
    if (!listing.externalProductId || !listing.externalVariantIds) continue;

    const variants = await db.query.masterVariants.findMany({
      where: eq(masterVariants.masterProductId, listing.masterProductId),
    });

    const variantMap = listing.externalVariantIds as Record<string, string>;
    const stockUpdates = variants
      .filter((v) => variantMap[String(v.id)])
      .map((v) => ({
        externalVariantId: variantMap[String(v.id)],
        stockQuantity: v.stockQuantity,
      }));

    if (stockUpdates.length === 0) continue;

    try {
      console.log(`[SYNC] Updating stock for tenant ${tenantId}, product ${listing.masterProductId}, ${stockUpdates.length} variants`);
      const stockResult = await adapter.updateStock(credentials, listing.externalProductId, stockUpdates);
      if (!stockResult.success) {
        console.error(`[SYNC] Stock update partial failure:`, stockResult.errors);
      } else {
        console.log(`[SYNC] Stock updated: ${stockResult.variantsUpdated} variants`);
      }
    } catch (err) {
      console.error(`[SYNC] Failed to update stock for tenant ${tenantId}, product ${listing.masterProductId}:`, err);
    }
  }
}

/**
 * Push a product to tenant's marketplace.
 * Görseller tenant ayarı (push_images_enabled) ile kontrol edilir.
 */
export async function pushProductToTenant(
  tenantId: number,
  marketplace: MarketplaceName,
  masterProductId: number,
  categoryMapping?: string,
  selectedVariantIds?: number[]
): Promise<{ success: boolean; error?: string }> {
  const credentials = await resolveCredentials(tenantId, marketplace);
  if (!credentials) {
    return { success: false, error: "Marketplace credentials not configured" };
  }

  const adapter = getAdapter(marketplace);

  // Check if already pushed
  const existingTenantProduct = await db.query.tenantProducts.findFirst({
    where: and(
      eq(tenantProducts.tenantId, tenantId),
      eq(tenantProducts.masterProductId, masterProductId)
    ),
  });

  if (existingTenantProduct?.externalProductId) {
    return { success: false, error: "Bu ürün zaten aktarılmış" };
  }

  const product = await db.query.masterProducts.findFirst({
    where: eq(masterProducts.id, masterProductId),
  });

  if (!product) {
    return { success: false, error: "Ürün bulunamadı" };
  }

  let variants = await db.query.masterVariants.findMany({
    where: eq(masterVariants.masterProductId, masterProductId),
  });

  // Filter by selected variant IDs if provided
  if (selectedVariantIds && selectedVariantIds.length > 0) {
    variants = variants.filter((v) => selectedVariantIds.includes(v.id));
  }

  // Filter out zero-stock variants
  variants = variants.filter((v) => v.stockQuantity > 0);

  if (variants.length === 0) {
    return { success: false, error: "Stoklu varyant bulunamadı" };
  }

  // Epic J: her varyant için mağaza bazlı benzersiz SKU + barkod üret/getir.
  // Pazaryerlerinde ürünler birbiriyle eşleşmesin + sipariş ters eşlemesi için.
  const skuMap = await ensureVariantSkuMappings(
    tenantId,
    marketplace,
    variants.map((v) => v.id)
  );

  // Fiyatlandırma: üyenin TL satış fiyatını hesapla (USD B2B × kur × markup / manuel).
  const priceMap = await getTenantVariantPrices(
    tenantId,
    variants.map((v) => ({ id: v.id, usdPrice: Number(v.usdPrice) }))
  );

  // Build unique variant names: color + size, or just color/size if one is missing
  const variantData = variants.map((v) => {
    const parts: string[] = [];
    if (v.color) parts.push(v.color);
    if (v.size && v.size !== "STD") parts.push(v.size);
    const mapping = skuMap.get(v.id);
    const storeBarcode = mapping?.storeBarcode ?? v.barcode;
    const sizeName = parts.length > 0 ? parts.join(" / ") : `${storeBarcode}`;
    const priced = priceMap.get(v.id);
    return {
      variantId: v.id,
      sizeName,
      sku: mapping?.storeSku ?? v.sku,
      barcode: storeBarcode,
      costPrice: priced ? priced.baseTry : Number(v.costPrice),
      salePrice: priced ? priced.priceTry : Number(v.salePrice),
      stockQuantity: v.stockQuantity,
      widthCm: null,
      heightCm: null,
    };
  });

  const pushImages = await tenantPushesImages(tenantId);
  const { images, coverImage } = pushImages
    ? collectImages(variants, product.images || [])
    : { images: [], coverImage: "" };

  const result = await adapter.pushProduct(credentials, {
    productId: product.id,
    title: product.name,
    description: product.description || "",
    bodyHtml: product.description || "",
    images,
    coverImage,
    warehouseSku: product.sku,
    categoryMapping: categoryMapping
      ? { externalCategoryId: categoryMapping }
      : undefined,
    variants: variantData,
  });

  if (result.success) {
    await db
      .insert(tenantProducts)
      .values({
        tenantId,
        masterProductId,
        externalProductId: result.externalProductId || null,
        externalVariantIds: result.externalVariantIds || null,
        categoryMapping: categoryMapping || null,
        status: "active",
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [tenantProducts.tenantId, tenantProducts.masterProductId],
        set: {
          externalProductId: result.externalProductId || null,
          externalVariantIds: result.externalVariantIds || null,
          categoryMapping: categoryMapping || null,
          status: "active",
          syncedAt: new Date(),
        },
      });

    // Epic J: pazaryeri dış varyant ID'lerini SKU eşleme tablosuna yaz
    // (externalVariantIds master varyant id ile anahtarlanır).
    if (result.externalVariantIds) {
      const extIds: Record<number, string> = {};
      for (const [k, v] of Object.entries(result.externalVariantIds)) {
        const id = Number(k);
        if (!Number.isNaN(id) && typeof v === "string") extIds[id] = v;
      }
      await saveExternalIdsForMappings(
        tenantId,
        marketplace,
        result.externalProductId || null,
        extIds
      );
    }
  }

  return { success: result.success, error: result.error };
}

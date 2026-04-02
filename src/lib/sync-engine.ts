import { db } from "./db";
import { tenants, tenantProducts, masterVariants, masterProducts, syncLogs } from "./schema";
import { eq, and } from "drizzle-orm";
import { getAdapter } from "./marketplace/registry";
import { resolveCredentials } from "./marketplace/credential-resolver";
import type { MarketplaceName } from "./marketplace/types";

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

  const result = {
    totalTenants: activeTenants.length,
    successCount: 0,
    errorCount: 0,
    errors: [] as Array<{ tenantId: number; error: string }>,
  };

  const syncPromises = activeTenants
    .filter((t) => !t.isAdmin)
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
      await adapter.updateStock(credentials, listing.externalProductId, stockUpdates);
    } catch (err) {
      console.error(`[SYNC] Failed to update stock for tenant ${tenantId}, product ${listing.masterProductId}:`, err);
    }
  }
}

/**
 * Push a product to tenant's marketplace as DRAFT (no images).
 */
export async function pushProductToTenant(
  tenantId: number,
  marketplace: MarketplaceName,
  masterProductId: number,
  categoryMapping?: string
): Promise<{ success: boolean; error?: string }> {
  const credentials = await resolveCredentials(tenantId, marketplace);
  if (!credentials) {
    return { success: false, error: "Marketplace credentials not configured" };
  }

  const adapter = getAdapter(marketplace);

  const product = await db.query.masterProducts.findFirst({
    where: eq(masterProducts.id, masterProductId),
  });

  if (!product) {
    return { success: false, error: "Product not found" };
  }

  const variants = await db.query.masterVariants.findMany({
    where: eq(masterVariants.masterProductId, masterProductId),
  });

  const result = await adapter.pushProduct(credentials, {
    productId: product.id,
    title: product.name,
    description: product.description || "",
    bodyHtml: product.description || "",
    images: [], // NO IMAGES - müşteri kendi ekleyecek
    coverImage: "",
    warehouseSku: product.sku,
    categoryMapping: categoryMapping
      ? { externalCategoryId: categoryMapping }
      : undefined,
    variants: variants.map((v) => ({
      variantId: v.id,
      sizeName: v.size,
      sku: v.sku,
      barcode: v.barcode,
      costPrice: Number(v.costPrice),
      salePrice: Number(v.salePrice),
      stockQuantity: v.stockQuantity,
      widthCm: null,
      heightCm: null,
    })),
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
  }

  return { success: result.success, error: result.error };
}

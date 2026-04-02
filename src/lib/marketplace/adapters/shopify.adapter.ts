import type {
  MarketplaceAdapter,
  MarketplaceCredentials,
  MarketplaceProduct,
  PushResult,
  UpdateResult,
  StockUpdateResult,
  PriceUpdateResult,
  CategoryNode,
} from "../types";
import {
  createShopifyProduct,
  getShopifyProduct,
  updateShopifyInventory,
  getPrimaryLocationId,
  getLocationFromInventoryItem,
  type ShopifyCredentials,
} from "@/lib/shopify";

interface ShopifyAdapterCredentials extends MarketplaceCredentials {
  marketplace: "shopify";
  shopify_store_url: string;
  shopify_client_id: string;
  shopify_client_secret: string;
  shopify_location_id?: string;
  shopify_product_status?: string;
}

function toShopifyCreds(creds: MarketplaceCredentials): ShopifyCredentials {
  const c = creds as ShopifyAdapterCredentials;
  return {
    storeUrl: c.shopify_store_url,
    clientId: c.shopify_client_id,
    clientSecret: c.shopify_client_secret,
  };
}

async function resolveLocationId(
  shopifyCreds: ShopifyCredentials,
  adapterCreds: ShopifyAdapterCredentials,
  inventoryItemId?: number
): Promise<string> {
  // 1. Use explicit location from settings
  if (adapterCreds.shopify_location_id) {
    return adapterCreds.shopify_location_id;
  }

  // 2. Try to get from inventory item
  if (inventoryItemId) {
    try {
      return await getLocationFromInventoryItem(shopifyCreds, inventoryItemId);
    } catch {
      // Fall through
    }
  }

  // 3. Try primary location
  return await getPrimaryLocationId(shopifyCreds);
}

export class ShopifyAdapter implements MarketplaceAdapter {
  readonly name = "shopify" as const;
  readonly displayName = "Shopify";
  readonly isAsync = false;
  readonly requiredSettings = [
    "shopify_store_url",
    "shopify_client_id",
    "shopify_client_secret",
  ];

  async validateCredentials(
    credentials: MarketplaceCredentials
  ): Promise<boolean> {
    try {
      const shopifyCreds = toShopifyCreds(credentials);
      await getPrimaryLocationId(shopifyCreds);
      return true;
    } catch {
      return false;
    }
  }

  async pushProduct(
    credentials: MarketplaceCredentials,
    product: MarketplaceProduct
  ): Promise<PushResult> {
    try {
      const shopifyCreds = toShopifyCreds(credentials);
      const adapterCreds = credentials as ShopifyAdapterCredentials;

      const created = await createShopifyProduct(
        shopifyCreds,
        {
          title: product.title,
          bodyHtml: product.bodyHtml,
          images: product.images,
          warehouseSku: product.warehouseSku,
          status:
            (adapterCreds.shopify_product_status as "active" | "draft") ||
            "draft",
          skuPrefix: product.skuPrefix,
        },
        product.variants.map((v) => ({
          sizeName: v.sizeName,
          salePrice: v.salePrice,
          costPrice: v.costPrice,
          stockQuantity: v.stockQuantity,
        }))
      );

      // Build externalVariantIds map: local variantId -> shopify variant id
      const externalVariantIds: Record<string, string> = {};
      for (const variant of product.variants) {
        const matched = created.variants.find(
          (sv) => sv.option1 === variant.sizeName
        );
        if (matched) {
          externalVariantIds[String(variant.variantId)] = String(matched.id);
        }
      }

      // Add to collection if categoryMapping has a collection ID
      if (product.categoryMapping?.externalCategoryId) {
        try {
          const token = await getAccessTokenForAdapter(shopifyCreds);
          const collectionId = product.categoryMapping.externalCategoryId;
          await fetch(
            `https://${shopifyCreds.storeUrl}/admin/api/2024-01/collects.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": token,
              },
              body: JSON.stringify({
                collect: {
                  product_id: created.id,
                  collection_id: parseInt(collectionId, 10),
                },
              }),
            }
          );
        } catch {
          // Collection add failed - non-critical, don't fail the push
        }
      }

      return {
        success: true,
        externalProductId: String(created.id),
        externalVariantIds,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async updateProduct(
    credentials: MarketplaceCredentials,
    externalProductId: string,
    product: Partial<MarketplaceProduct>
  ): Promise<UpdateResult> {
    try {
      const shopifyCreds = toShopifyCreds(credentials);
      const productId = parseInt(externalProductId, 10);

      const updatePayload: Record<string, unknown> = { id: productId };
      if (product.title) updatePayload.title = product.title;
      if (product.bodyHtml) updatePayload.body_html = product.bodyHtml;

      const res = await fetch(
        `https://${shopifyCreds.storeUrl}/admin/api/2024-01/products/${productId}.json`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": await getAccessTokenForAdapter(shopifyCreds),
          },
          body: JSON.stringify({ product: updatePayload }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Shopify update product failed: ${res.status} - ${err}`);
      }

      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async updateStock(
    credentials: MarketplaceCredentials,
    externalProductId: string,
    variants: Array<{ externalVariantId: string; stockQuantity: number }>
  ): Promise<StockUpdateResult> {
    const result: StockUpdateResult = {
      success: true,
      variantsUpdated: 0,
      errors: [],
    };

    try {
      const shopifyCreds = toShopifyCreds(credentials);
      const adapterCreds = credentials as ShopifyAdapterCredentials;
      const productId = parseInt(externalProductId, 10);

      // Fetch product to get inventory_item_ids
      const shopifyProduct = await getShopifyProduct(shopifyCreds, productId);

      // Build variant id -> inventory_item_id map
      const invMap = new Map<string, number>();
      for (const sv of shopifyProduct.variants) {
        invMap.set(String(sv.id), sv.inventory_item_id);
      }

      // Resolve location
      const firstInvItemId = shopifyProduct.variants[0]?.inventory_item_id;
      const locationId = await resolveLocationId(
        shopifyCreds,
        adapterCreds,
        firstInvItemId
      );

      for (const v of variants) {
        const inventoryItemId = invMap.get(v.externalVariantId);
        if (!inventoryItemId) {
          result.errors.push({
            variantId: parseInt(v.externalVariantId, 10),
            sizeName: "",
            error: `Variant ${v.externalVariantId} not found on Shopify product`,
          });
          continue;
        }

        try {
          await updateShopifyInventory(
            shopifyCreds,
            inventoryItemId,
            locationId,
            v.stockQuantity
          );
          result.variantsUpdated++;
        } catch (err: unknown) {
          result.errors.push({
            variantId: parseInt(v.externalVariantId, 10),
            sizeName: "",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      if (result.errors.length > 0) {
        result.success = result.variantsUpdated > 0;
      }
    } catch (err: unknown) {
      result.success = false;
      result.errors.push({
        variantId: 0,
        sizeName: "",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }

    return result;
  }

  async updatePrice(
    credentials: MarketplaceCredentials,
    externalProductId: string,
    variants: Array<{
      externalVariantId: string;
      salePrice: number;
      costPrice?: number;
    }>
  ): Promise<PriceUpdateResult> {
    const result: PriceUpdateResult = {
      success: true,
      variantsUpdated: 0,
      errors: [],
    };

    try {
      const shopifyCreds = toShopifyCreds(credentials);

      for (const v of variants) {
        try {
          const variantId = parseInt(v.externalVariantId, 10);
          const updatePayload: Record<string, unknown> = {
            id: variantId,
            price: v.salePrice.toFixed(2),
          };
          if (v.costPrice !== undefined) {
            updatePayload.cost = v.costPrice.toFixed(2);
          }

          const res = await fetch(
            `https://${shopifyCreds.storeUrl}/admin/api/2024-01/variants/${variantId}.json`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token":
                  await getAccessTokenForAdapter(shopifyCreds),
              },
              body: JSON.stringify({ variant: updatePayload }),
            }
          );

          if (!res.ok) {
            const err = await res.text();
            throw new Error(
              `Shopify variant price update failed: ${res.status} - ${err}`
            );
          }

          result.variantsUpdated++;
        } catch (err: unknown) {
          result.errors.push({
            variantId: parseInt(v.externalVariantId, 10),
            sizeName: "",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      if (result.errors.length > 0) {
        result.success = result.variantsUpdated > 0;
      }
    } catch (err: unknown) {
      result.success = false;
      result.errors.push({
        variantId: 0,
        sizeName: "",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }

    return result;
  }

  async delistProduct(
    credentials: MarketplaceCredentials,
    externalProductId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const shopifyCreds = toShopifyCreds(credentials);
      const productId = parseInt(externalProductId, 10);

      const res = await fetch(
        `https://${shopifyCreds.storeUrl}/admin/api/2024-01/products/${productId}.json`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": await getAccessTokenForAdapter(shopifyCreds),
          },
          body: JSON.stringify({ product: { id: productId, status: "archived" } }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(
          `Shopify delist product failed: ${res.status} - ${err}`
        );
      }

      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async getBrands(
    credentials: MarketplaceCredentials,
    _query?: string
  ): Promise<Array<{ id: string; name: string }>> {
    // Shopify does not have a dedicated brands API.
    // Vendors serve as brands but there is no list endpoint.
    return [];
  }

  async getCategories(
    credentials: MarketplaceCredentials
  ): Promise<CategoryNode[]> {
    try {
      const shopifyCreds = toShopifyCreds(credentials);
      const token = await getAccessTokenForAdapter(shopifyCreds);

      // Fetch custom collections
      const customRes = await fetch(
        `https://${shopifyCreds.storeUrl}/admin/api/2024-01/custom_collections.json?limit=250`,
        {
          headers: { "X-Shopify-Access-Token": token },
        }
      );

      // Fetch smart collections
      const smartRes = await fetch(
        `https://${shopifyCreds.storeUrl}/admin/api/2024-01/smart_collections.json?limit=250`,
        {
          headers: { "X-Shopify-Access-Token": token },
        }
      );

      const collections: CategoryNode[] = [];

      if (customRes.ok) {
        const customData = await customRes.json();
        for (const c of customData.custom_collections || []) {
          collections.push({
            id: String(c.id),
            name: `${c.title} (Özel Koleksiyon)`,
          });
        }
      }

      if (smartRes.ok) {
        const smartData = await smartRes.json();
        for (const c of smartData.smart_collections || []) {
          collections.push({
            id: String(c.id),
            name: `${c.title} (Akıllı Koleksiyon)`,
          });
        }
      }

      return collections;
    } catch {
      return [];
    }
  }
}

/**
 * Helper to get access token for direct API calls not covered by lib/shopify.ts.
 * Uses the same token mechanism via a lightweight fetch.
 */
async function getAccessTokenForAdapter(
  creds: ShopifyCredentials
): Promise<string> {
  const res = await fetch(
    `https://${creds.storeUrl}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify token request failed: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

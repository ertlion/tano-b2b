export interface ShopifyCredentials {
  storeUrl: string;
  clientId: string;
  clientSecret: string;
}

const lastRequestTime = new Map<string, number>();
async function rateLimitWait(storeUrl: string) {
  const last = lastRequestTime.get(storeUrl) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < 550) {
    await new Promise((r) => setTimeout(r, 550 - elapsed));
  }
  lastRequestTime.set(storeUrl, Date.now());
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const locationCache = new Map<string, string>();

export async function getAccessToken(creds: ShopifyCredentials): Promise<string> {
  const cached = tokenCache.get(creds.storeUrl);
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.token;
  }

  const res = await fetch(`https://${creds.storeUrl}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify token request failed: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const token = data.access_token as string;
  const expiresIn = (data.expires_in as number) || 86399;

  tokenCache.set(creds.storeUrl, {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return token;
}

async function getHeaders(creds: ShopifyCredentials): Promise<HeadersInit> {
  const token = await getAccessToken(creds);
  return {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": token,
  };
}

function getBaseUrl(creds: ShopifyCredentials): string {
  return `https://${creds.storeUrl}/admin/api/2024-01`;
}

export async function getLocationFromInventoryItem(
  creds: ShopifyCredentials,
  inventoryItemId: number
): Promise<string> {
  const cached = locationCache.get(creds.storeUrl);
  if (cached) return cached;

  const res = await fetch(
    `${getBaseUrl(creds)}/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
    { headers: await getHeaders(creds) }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify inventory_levels fetch failed: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const levels = data.inventory_levels as { location_id: number }[];

  if (!levels || levels.length === 0) {
    throw new Error("No inventory levels found for this item");
  }

  const locationId = String(levels[0].location_id);
  locationCache.set(creds.storeUrl, locationId);
  return locationId;
}

export async function getPrimaryLocationId(creds: ShopifyCredentials): Promise<string> {
  const cached = locationCache.get(creds.storeUrl);
  if (cached) return cached;

  const res = await fetch(`${getBaseUrl(creds)}/locations.json`, {
    headers: await getHeaders(creds),
  });

  if (!res.ok) {
    throw new Error(`Shopify locations API hatası: ${res.status}`);
  }

  const data = await res.json();
  const locations = data.locations as { id: number; active: boolean; primary: boolean }[];
  const primary = locations.find((l) => l.primary) || locations.find((l) => l.active) || locations[0];
  if (primary) {
    const locationId = String(primary.id);
    locationCache.set(creds.storeUrl, locationId);
    return locationId;
  }

  throw new Error("Shopify mağazasında aktif lokasyon bulunamadı.");
}

interface ShopifyProduct {
  id: number;
  variants: { id: number; option1: string; inventory_item_id: number }[];
}

export async function createShopifyProduct(
  creds: ShopifyCredentials,
  product: {
    title: string;
    bodyHtml: string;
    images: string[];
    warehouseSku: string;
    status?: "active" | "draft";
    skuPrefix?: string;
  },
  variants: {
    sizeName: string;
    salePrice: number;
    costPrice: number;
    stockQuantity: number;
  }[]
): Promise<ShopifyProduct> {
  const prefix = product.skuPrefix ? `${product.skuPrefix}${product.warehouseSku}` : product.warehouseSku;

  const body = {
    product: {
      title: product.title,
      body_html: product.bodyHtml,
      status: product.status || "draft",
      images: product.images
        .filter((img) => img.startsWith("https://"))
        .map((src) => ({ src })),
      options: [{ name: "Beden" }],
      variants: variants.map((v) => ({
        option1: v.sizeName,
        price: v.salePrice.toFixed(2),
        sku: `${prefix}-${v.sizeName}`,
        cost: v.costPrice.toFixed(2),
        requires_shipping: true,
        inventory_management: "shopify" as const,
        weight: 0.5,
        weight_unit: "kg",
      })),
    },
  };

  const res = await fetch(`${getBaseUrl(creds)}/products.json`, {
    method: "POST",
    headers: await getHeaders(creds),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify create product failed: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const createdProduct = data.product as ShopifyProduct;

  const firstVariant = createdProduct.variants[0];
  if (!firstVariant) return createdProduct;

  const locationId = await getLocationFromInventoryItem(creds, firstVariant.inventory_item_id);

  for (const createdVariant of createdProduct.variants) {
    const matchingInput = variants.find((v) => v.sizeName === createdVariant.option1);
    if (!matchingInput) continue;

    try {
      await updateShopifyInventory(creds, createdVariant.inventory_item_id, locationId, matchingInput.stockQuantity);
    } catch (err) {
      console.error(`[SHOPIFY] Inventory set failed for ${createdVariant.option1}:`, err);
    }
  }

  return createdProduct;
}

export async function updateShopifyInventory(
  creds: ShopifyCredentials,
  inventoryItemId: number,
  locationId: string,
  quantity: number
): Promise<void> {
  await rateLimitWait(creds.storeUrl);
  const res = await fetch(`${getBaseUrl(creds)}/inventory_levels/set.json`, {
    method: "POST",
    headers: await getHeaders(creds),
    body: JSON.stringify({
      inventory_item_id: inventoryItemId,
      location_id: parseInt(locationId, 10),
      available: quantity,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify inventory set failed: ${res.status} - ${body}`);
  }
}

export async function getShopifyProduct(
  creds: ShopifyCredentials,
  productId: number
): Promise<ShopifyProduct> {
  await rateLimitWait(creds.storeUrl);
  const res = await fetch(`${getBaseUrl(creds)}/products/${productId}.json`, {
    headers: await getHeaders(creds),
  });

  if (!res.ok) {
    throw new Error(`Shopify product fetch failed: ${res.status} (product ${productId})`);
  }

  const data = await res.json();
  return data.product;
}

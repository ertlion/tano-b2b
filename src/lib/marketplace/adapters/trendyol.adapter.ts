import type {
  MarketplaceAdapter,
  MarketplaceCredentials,
  MarketplaceProduct,
  PushResult,
  UpdateResult,
  StockUpdateResult,
  PriceUpdateResult,
  CategoryNode,
  CategoryAttribute,
} from "../types";

// ─── TYPES ────────────────────────────────────────────────

interface TrendyolCredentials extends MarketplaceCredentials {
  marketplace: "trendyol";
  trendyol_supplier_id: string;
  trendyol_api_key: string;
  trendyol_api_secret: string;
}

interface TrendyolCategory {
  id: number;
  name: string;
  parentId?: number;
  subCategories?: TrendyolCategory[];
}

const TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";

// ─── HELPERS ──────────────────────────────────────────────

function toTrendyolCreds(creds: MarketplaceCredentials): TrendyolCredentials {
  return creds as TrendyolCredentials;
}

function getAuthHeader(apiKey: string, apiSecret: string): string {
  return "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
}

function getUserAgent(supplierId: string): string {
  return `${supplierId} - SelfIntegration`;
}

function filterHttpsImages(images: string[]): string[] {
  return images.filter((img) => img.startsWith("https://"));
}

async function trendyolRequest(
  creds: TrendyolCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const url = `${TRENDYOL_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Authorization": getAuthHeader(creds.trendyol_api_key, creds.trendyol_api_secret),
    "User-Agent": getUserAgent(creds.trendyol_supplier_id),
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return res;
}

// ─── ADAPTER ──────────────────────────────────────────────

export class TrendyolAdapter implements MarketplaceAdapter {
  readonly name = "trendyol" as const;
  readonly displayName = "Trendyol";
  readonly isAsync = true;
  readonly requiredSettings = [
    "trendyol_supplier_id",
    "trendyol_api_key",
    "trendyol_api_secret",
  ];

  async validateCredentials(
    credentials: MarketplaceCredentials
  ): Promise<boolean> {
    const creds = toTrendyolCreds(credentials);
    const res = await trendyolRequest(
      creds,
      "GET",
      `/suppliers/${creds.trendyol_supplier_id}/products?page=0&size=1`
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Trendyol API hatasi: ${res.status} - ${err}`);
    }

    return true;
  }

  async pushProduct(
    credentials: MarketplaceCredentials,
    product: MarketplaceProduct
  ): Promise<PushResult> {
    try {
      const creds = toTrendyolCreds(credentials);

      const categoryId = product.categoryMapping?.externalCategoryId
        ? parseInt(product.categoryMapping.externalCategoryId, 10)
        : 411; // Default: Giyim

      const brandId = product.brandId
        ? parseInt(product.brandId, 10)
        : undefined;

      const images = filterHttpsImages(product.images).map((url) => ({ url }));

      const attributes = product.categoryMapping?.attributes
        ? Object.entries(product.categoryMapping.attributes).map(
            ([id, value]) => ({
              attributeId: parseInt(id, 10),
              attributeValueId: parseInt(value, 10),
            })
          )
        : [];

      const items = product.variants.map((v) => ({
        barcode: v.barcode || `${product.warehouseSku}-${v.sizeName}`,
        title: product.title,
        productMainId: product.warehouseSku,
        brandId: brandId ?? 0,
        categoryId,
        quantity: v.stockQuantity,
        stockCode: v.sku,
        dimensionalWeight: 0,
        description: product.description || product.title,
        currencyType: "TRY",
        listPrice: v.salePrice,
        salePrice: v.salePrice,
        vatRate: 10,
        cargoCompanyId: 10,
        images: images.length > 0 ? images : [{ url: product.coverImage }],
        attributes: [
          ...attributes,
          ...(v.sizeName && v.sizeName !== "STD"
            ? [{ attributeId: 338, customAttributeValue: v.sizeName }]
            : []),
        ],
      }));

      const res = await trendyolRequest(
        creds,
        "POST",
        `/suppliers/${creds.trendyol_supplier_id}/v2/products`,
        { items }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Trendyol urun gonderme hatasi: ${res.status} - ${err}`);
      }

      const data = await res.json();
      const batchRequestId = data?.batchRequestId;

      return {
        success: true,
        externalProductId: product.warehouseSku,
        asyncTrackingId: batchRequestId ? String(batchRequestId) : undefined,
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
      const creds = toTrendyolCreds(credentials);

      // Trendyol uses the same create endpoint for updates
      // We need at least barcode to identify the product
      const items: Array<Record<string, unknown>> = [];

      if (product.variants && product.variants.length > 0) {
        for (const v of product.variants) {
          const item: Record<string, unknown> = {
            barcode: v.barcode || `${externalProductId}-${v.sizeName}`,
          };
          if (product.title) item.title = product.title;
          if (product.description) item.description = product.description;

          const images = product.images
            ? filterHttpsImages(product.images).map((url) => ({ url }))
            : undefined;
          if (images && images.length > 0) item.images = images;

          items.push(item);
        }
      }

      if (items.length === 0) {
        return { success: true };
      }

      const res = await trendyolRequest(
        creds,
        "PUT",
        `/suppliers/${creds.trendyol_supplier_id}/v2/products`,
        { items }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Trendyol urun guncelleme hatasi: ${res.status} - ${err}`);
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
    _externalProductId: string,
    variants: Array<{ externalVariantId: string; stockQuantity: number }>
  ): Promise<StockUpdateResult> {
    const result: StockUpdateResult = {
      success: true,
      variantsUpdated: 0,
      errors: [],
    };

    try {
      const creds = toTrendyolCreds(credentials);

      // externalVariantId is barcode for Trendyol
      const items = variants.map((v) => ({
        barcode: v.externalVariantId,
        quantity: v.stockQuantity,
      }));

      const res = await trendyolRequest(
        creds,
        "POST",
        `/suppliers/${creds.trendyol_supplier_id}/products/price-and-inventory`,
        { items }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Trendyol stok guncelleme hatasi: ${res.status} - ${err}`);
      }

      result.variantsUpdated = variants.length;
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
    _externalProductId: string,
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
      const creds = toTrendyolCreds(credentials);

      // externalVariantId is barcode for Trendyol
      const items = variants.map((v) => ({
        barcode: v.externalVariantId,
        salePrice: v.salePrice,
        listPrice: v.salePrice, // listPrice >= salePrice required
      }));

      const res = await trendyolRequest(
        creds,
        "POST",
        `/suppliers/${creds.trendyol_supplier_id}/products/price-and-inventory`,
        { items }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Trendyol fiyat guncelleme hatasi: ${res.status} - ${err}`);
      }

      result.variantsUpdated = variants.length;
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
      const creds = toTrendyolCreds(credentials);

      // Set quantity to 0 to delist
      const items = [
        {
          barcode: externalProductId,
          quantity: 0,
        },
      ];

      const res = await trendyolRequest(
        creds,
        "POST",
        `/suppliers/${creds.trendyol_supplier_id}/products/price-and-inventory`,
        { items }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Trendyol urun kaldirma hatasi: ${res.status} - ${err}`);
      }

      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async getCategories(
    credentials: MarketplaceCredentials,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _parentId?: string
  ): Promise<CategoryNode[]> {
    try {
      const creds = toTrendyolCreds(credentials);
      const res = await trendyolRequest(creds, "GET", "/product-categories");

      if (!res.ok) return [];

      const data = await res.json();
      const categories = data?.categories || [];

      const mapCategory = (cat: TrendyolCategory): CategoryNode => ({
        id: String(cat.id),
        name: cat.name,
        parentId: cat.parentId ? String(cat.parentId) : undefined,
        children: cat.subCategories?.map(mapCategory),
      });

      return categories.map(mapCategory);
    } catch {
      return [];
    }
  }

  async getCategoryAttributes(
    credentials: MarketplaceCredentials,
    categoryId: string
  ): Promise<CategoryAttribute[]> {
    try {
      const creds = toTrendyolCreds(credentials);
      const res = await trendyolRequest(
        creds,
        "GET",
        `/product-categories/${categoryId}/attributes`
      );

      if (!res.ok) return [];

      const data = await res.json();
      const attrs = data?.categoryAttributes || [];

      return attrs.map(
        (a: {
          attribute: { id: number; name: string };
          required: boolean;
          attributeValues?: Array<{ id: number; name: string }>;
        }) => ({
          id: String(a.attribute.id),
          name: a.attribute.name,
          required: a.required,
          values: a.attributeValues?.map((v: { id: number; name: string }) => ({
            id: String(v.id),
            name: v.name,
          })),
        })
      );
    } catch {
      return [];
    }
  }

  async getBrands(
    credentials: MarketplaceCredentials,
    query?: string
  ): Promise<Array<{ id: string; name: string }>> {
    try {
      if (!query || query.length < 2) return [];

      const creds = toTrendyolCreds(credentials);
      const res = await trendyolRequest(
        creds,
        "GET",
        `/brands/by-name?name=${encodeURIComponent(query)}`
      );

      if (!res.ok) return [];

      const data = await res.json();
      const brands = data?.brands || [];

      return brands.map((b: { id: number; name: string }) => ({
        id: String(b.id),
        name: b.name,
      }));
    } catch {
      return [];
    }
  }
}

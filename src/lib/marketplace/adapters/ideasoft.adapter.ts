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

interface IdeaSoftCredentials extends MarketplaceCredentials {
  marketplace: "ideasoft";
  ideasoft_store_url: string;
  ideasoft_access_token: string;
}

function toIdeaSoftCreds(creds: MarketplaceCredentials): IdeaSoftCredentials {
  return creds as IdeaSoftCredentials;
}

function filterHttpsImages(images: string[]): string[] {
  return images.filter((img) => img.startsWith("https://"));
}

export class IdeaSoftAdapter implements MarketplaceAdapter {
  readonly name = "ideasoft" as const;
  readonly displayName = "IdeaSoft";
  readonly isAsync = false;
  readonly requiredSettings = ["ideasoft_store_url", "ideasoft_access_token"];

  private getBaseUrl(creds: IdeaSoftCredentials): string {
    return creds.ideasoft_store_url.replace(/\/+$/, "");
  }

  private async request(
    creds: IdeaSoftCredentials,
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const baseUrl = this.getBaseUrl(creds);

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${creds.ideasoft_access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`IdeaSoft API ${res.status}: ${err}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return res.json();
    }

    return res.text();
  }

  async validateCredentials(
    credentials: MarketplaceCredentials
  ): Promise<boolean> {
    try {
      const creds = toIdeaSoftCreds(credentials);
      await this.request(creds, "GET", "/api/products?limit=1");
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
      const creds = toIdeaSoftCreds(credentials);
      const httpsImages = filterHttpsImages(product.images);

      const payload = {
        name: product.title,
        fullDescription: product.bodyHtml || product.description,
        sku: product.warehouseSku,
        stockCode: product.warehouseSku,
        categoryId: product.categoryMapping?.externalCategoryId
          ? Number(product.categoryMapping.externalCategoryId)
          : undefined,
        images: httpsImages.map((url, idx) => ({
          url,
          sortOrder: idx,
        })),
        variants: product.variants.map((variant) => ({
          sku: variant.sku,
          barcode: variant.barcode ?? variant.sku,
          price: variant.salePrice,
          stock: variant.stockQuantity,
          name: variant.sizeName,
        })),
      };

      const response = (await this.request(
        creds,
        "POST",
        "/api/products",
        payload
      )) as { id?: number };

      const externalProductId = String(
        response.id ?? product.warehouseSku
      );

      const externalVariantIds: Record<string, string> = {};
      for (const variant of product.variants) {
        externalVariantIds[String(variant.variantId)] = variant.sku;
      }

      return {
        success: true,
        externalProductId,
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
      const creds = toIdeaSoftCreds(credentials);

      const payload: Record<string, unknown> = {};

      if (product.title) payload.name = product.title;
      if (product.description || product.bodyHtml) {
        payload.fullDescription = product.bodyHtml ?? product.description;
      }
      if (product.images) {
        const httpsImages = filterHttpsImages(product.images);
        payload.images = httpsImages.map((url, idx) => ({
          url,
          sortOrder: idx,
        }));
      }
      if (product.variants && product.variants.length > 0) {
        payload.variants = product.variants.map((variant) => ({
          sku: variant.sku,
          barcode: variant.barcode ?? variant.sku,
          price: variant.salePrice,
          stock: variant.stockQuantity,
          name: variant.sizeName,
        }));
      }

      await this.request(
        creds,
        "PUT",
        `/api/products/${encodeURIComponent(externalProductId)}`,
        payload
      );

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
      const creds = toIdeaSoftCreds(credentials);

      const payload = {
        variants: variants.map((v) => ({
          sku: v.externalVariantId,
          stock: v.stockQuantity,
        })),
      };

      await this.request(
        creds,
        "PUT",
        `/api/products/${encodeURIComponent(externalProductId)}`,
        payload
      );

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
      const creds = toIdeaSoftCreds(credentials);

      const payload = {
        variants: variants.map((v) => ({
          sku: v.externalVariantId,
          price: v.salePrice,
        })),
      };

      await this.request(
        creds,
        "PUT",
        `/api/products/${encodeURIComponent(externalProductId)}`,
        payload
      );

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
      const creds = toIdeaSoftCreds(credentials);

      await this.request(
        creds,
        "PUT",
        `/api/products/${encodeURIComponent(externalProductId)}`,
        { status: 0 }
      );

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
    parentId?: string
  ): Promise<CategoryNode[]> {
    try {
      const creds = toIdeaSoftCreds(credentials);

      const path = parentId
        ? `/api/categories?parentId=${encodeURIComponent(parentId)}`
        : "/api/categories?parentId=0";

      const data = (await this.request(creds, "GET", path)) as Array<{
        id: number;
        name: string;
        parentId?: number;
      }>;

      const categories = Array.isArray(data) ? data : [];

      return categories.map((cat) => ({
        id: String(cat.id),
        name: cat.name,
        parentId: cat.parentId ? String(cat.parentId) : undefined,
      }));
    } catch {
      return [];
    }
  }

  async getBrands(
    credentials: MarketplaceCredentials,
    query?: string
  ): Promise<Array<{ id: string; name: string }>> {
    try {
      const creds = toIdeaSoftCreds(credentials);

      const path = query
        ? `/api/brands?name=${encodeURIComponent(query)}`
        : "/api/brands";

      const data = (await this.request(creds, "GET", path)) as Array<{
        id: number;
        name: string;
      }>;

      const brands = Array.isArray(data) ? data : [];

      return brands.map((b) => ({
        id: String(b.id),
        name: b.name,
      }));
    } catch {
      return [];
    }
  }

  async getCategoryAttributes(
    credentials: MarketplaceCredentials,
    categoryId: string
  ): Promise<CategoryAttribute[]> {
    try {
      const creds = toIdeaSoftCreds(credentials);

      const data = (await this.request(
        creds,
        "GET",
        `/api/categories/${encodeURIComponent(categoryId)}/attributes`
      )) as Array<{
        id: number;
        name: string;
        required?: boolean;
        values?: Array<{ id: number; name: string }>;
      }>;

      const attrs = Array.isArray(data) ? data : [];

      return attrs.map((a) => ({
        id: String(a.id),
        name: a.name,
        required: a.required ?? false,
        values: (a.values ?? []).map((v) => ({
          id: String(v.id),
          name: v.name,
        })),
      }));
    } catch {
      return [];
    }
  }
}

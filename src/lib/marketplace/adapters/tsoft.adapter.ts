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

interface TSoftCredentials extends MarketplaceCredentials {
  marketplace: "tsoft";
  tsoft_base_url: string;
  tsoft_username: string;
  tsoft_password: string;
  tsoft_access_token?: string;
}

function toTSoftCreds(creds: MarketplaceCredentials): TSoftCredentials {
  return creds as TSoftCredentials;
}

function filterHttpsImages(images: string[]): string[] {
  return images.filter((img) => img.startsWith("https://"));
}

export class TSoftAdapter implements MarketplaceAdapter {
  readonly name = "tsoft" as const;
  readonly displayName = "TSoft";
  readonly isAsync = false;
  readonly requiredSettings = [
    "tsoft_base_url",
    "tsoft_username",
    "tsoft_password",
  ];

  private async getToken(creds: TSoftCredentials): Promise<string> {
    if (creds.tsoft_access_token) {
      return creds.tsoft_access_token;
    }

    const baseUrl = creds.tsoft_base_url.replace(/\/+$/, "");

    const res = await fetch(`${baseUrl}/api/v3/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: creds.tsoft_username,
        password: creds.tsoft_password,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`TSoft login failed ${res.status}: ${err}`);
    }

    const data = (await res.json()) as { token?: string; access_token?: string };
    const token = data.token ?? data.access_token;

    if (!token) {
      throw new Error("TSoft login did not return a token");
    }

    return token;
  }

  private async request(
    creds: TSoftCredentials,
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const token = await this.getToken(creds);
    const baseUrl = creds.tsoft_base_url.replace(/\/+$/, "");

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`TSoft API ${res.status}: ${err}`);
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
      const creds = toTSoftCreds(credentials);
      await this.getToken(creds);
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
      const creds = toTSoftCreds(credentials);
      const httpsImages = filterHttpsImages(product.images);

      const payload = {
        name: product.title,
        description: product.bodyHtml || product.description,
        code: product.warehouseSku,
        images: httpsImages.map((url) => ({ url })),
        variants: product.variants.map((variant) => ({
          sku: variant.sku,
          barcode: variant.barcode ?? variant.sku,
          name: variant.sizeName,
          price: variant.salePrice,
          stock: variant.stockQuantity,
          width: variant.widthCm,
          height: variant.heightCm,
        })),
        categoryId: product.categoryMapping?.externalCategoryId,
        attributes: product.categoryMapping?.attributes,
      };

      const response = (await this.request(
        creds,
        "POST",
        "/api/v3/admin/products",
        payload
      )) as { id?: number; productId?: number };

      const externalProductId = String(
        response.id ?? response.productId ?? product.warehouseSku
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
      const creds = toTSoftCreds(credentials);

      const payload: Record<string, unknown> = {};

      if (product.title) payload.name = product.title;
      if (product.description || product.bodyHtml) {
        payload.description = product.bodyHtml ?? product.description;
      }
      if (product.images) {
        const httpsImages = filterHttpsImages(product.images);
        payload.images = httpsImages.map((url) => ({ url }));
      }
      if (product.variants && product.variants.length > 0) {
        payload.variants = product.variants.map((variant) => ({
          sku: variant.sku,
          barcode: variant.barcode ?? variant.sku,
          name: variant.sizeName,
          price: variant.salePrice,
          stock: variant.stockQuantity,
        }));
      }

      await this.request(
        creds,
        "PUT",
        `/api/v3/admin/products/${encodeURIComponent(externalProductId)}`,
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
      const creds = toTSoftCreds(credentials);

      const payload = {
        variants: variants.map((v) => ({
          sku: v.externalVariantId,
          stock: v.stockQuantity,
        })),
      };

      await this.request(
        creds,
        "PUT",
        `/api/v3/admin/products/${encodeURIComponent(externalProductId)}`,
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
      const creds = toTSoftCreds(credentials);

      const payload = {
        variants: variants.map((v) => ({
          sku: v.externalVariantId,
          price: v.salePrice,
        })),
      };

      await this.request(
        creds,
        "PUT",
        `/api/v3/admin/products/${encodeURIComponent(externalProductId)}`,
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
      const creds = toTSoftCreds(credentials);

      await this.request(
        creds,
        "DELETE",
        `/api/v3/admin/products/${encodeURIComponent(externalProductId)}`
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _parentId?: string
  ): Promise<CategoryNode[]> {
    try {
      const creds = toTSoftCreds(credentials);

      const data = (await this.request(
        creds,
        "GET",
        "/api/v3/admin/categories"
      )) as Array<{
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
}

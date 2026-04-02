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

interface IkasCredentials extends MarketplaceCredentials {
  marketplace: "ikas";
  ikas_store_url: string;
  ikas_api_key: string;
  ikas_api_secret: string;
}

interface IkasTokenCache {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, IkasTokenCache>();

export class IkasAdapter implements MarketplaceAdapter {
  readonly name = "ikas" as const;
  readonly displayName = "ikas";
  readonly isAsync = false;
  readonly requiredSettings = ["ikas_store_url", "ikas_api_key", "ikas_api_secret"];

  private getStoreUrl(creds: IkasCredentials): string {
    const url = creds.ikas_store_url.replace(/\/$/, "");
    return url.includes("myikas.com") ? url : `https://${url}.myikas.com`;
  }

  private async getToken(creds: IkasCredentials): Promise<string> {
    const cacheKey = creds.ikas_api_key;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const storeUrl = this.getStoreUrl(creds);
    const res = await fetch(`${storeUrl}/api/admin/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.ikas_api_key,
        client_secret: creds.ikas_api_secret,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ikas auth failed: ${res.status} - ${err}`);
    }

    const data = await res.json();
    const token = data.access_token;
    const expiresIn = data.expires_in || 86400;

    tokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    });

    return token;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async graphql(creds: IkasCredentials, query: string, variables?: Record<string, unknown>): Promise<any> {
    const token = await this.getToken(creds);
    const res = await fetch("https://api.myikas.com/api/v1/admin/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ikas API ${res.status}: ${err}`);
    }

    const data = await res.json();
    if (data.errors && data.errors.length > 0) {
      throw new Error(`ikas GraphQL: ${data.errors.map((e: { message: string }) => e.message).join(", ")}`);
    }

    return data.data;
  }

  async validateCredentials(credentials: MarketplaceCredentials): Promise<boolean> {
    const creds = credentials as IkasCredentials;
    try {
      await this.getToken(creds);
      return true;
    } catch {
      return false;
    }
  }

  async pushProduct(credentials: MarketplaceCredentials, product: MarketplaceProduct): Promise<PushResult> {
    const creds = credentials as IkasCredentials;
    try {
      const httpsImages = product.images.filter((img) => img.startsWith("https://"));

      const mutation = `
        mutation saveProduct($input: ProductInput!) {
          saveProduct(input: $input) {
            id
            name
            variants {
              id
              sku
            }
          }
        }
      `;

      const input: Record<string, unknown> = {
        name: product.title,
        description: product.bodyHtml,
        isActive: true,
        variants: product.variants.map((v) => ({
          sku: v.sku,
          barcode: v.barcode || v.sku,
          weight: Math.ceil(((v.widthCm || 100) * (v.heightCm || 100)) / 10000),
          isActive: true,
          prices: [
            {
              sellPrice: v.salePrice,
              buyPrice: v.costPrice,
            },
          ],
          stock: v.stockQuantity,
          images: httpsImages.slice(0, 1).map((url) => ({ url })),
          values: [
            { variantTypeName: "Boyut", variantValueName: v.sizeName },
          ],
        })),
        images: httpsImages.map((url, i) => ({
          url,
          order: i,
          isMain: i === 0,
        })),
      };

      if (product.categoryMapping?.externalCategoryId) {
        input.categoryIds = [product.categoryMapping.externalCategoryId];
      }

      const data = await this.graphql(creds, mutation, { input });
      const saved = data.saveProduct;

      const externalVariantIds: Record<string, string> = {};
      if (saved.variants) {
        for (let i = 0; i < saved.variants.length; i++) {
          const sv = saved.variants[i];
          const mv = product.variants[i];
          if (sv && mv) {
            externalVariantIds[String(mv.variantId)] = sv.id;
          }
        }
      }

      return {
        success: true,
        externalProductId: saved.id,
        externalVariantIds,
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async updateProduct(credentials: MarketplaceCredentials, externalProductId: string, product: Partial<MarketplaceProduct>): Promise<UpdateResult> {
    const creds = credentials as IkasCredentials;
    try {
      const mutation = `
        mutation saveProduct($input: ProductInput!) {
          saveProduct(input: $input) {
            id
          }
        }
      `;

      const input: Record<string, unknown> = { id: externalProductId };
      if (product.title) input.name = product.title;
      if (product.bodyHtml) input.description = product.bodyHtml;

      if (product.images) {
        const httpsImages = product.images.filter((img) => img.startsWith("https://"));
        input.images = httpsImages.map((url, i) => ({
          url,
          order: i,
          isMain: i === 0,
        }));
      }

      await this.graphql(creds, mutation, { input });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async updateStock(
    credentials: MarketplaceCredentials,
    externalProductId: string,
    variants: Array<{ externalVariantId: string; stockQuantity: number }>
  ): Promise<StockUpdateResult> {
    const creds = credentials as IkasCredentials;
    const errors: StockUpdateResult["errors"] = [];
    let updated = 0;

    try {
      // Get stock locations first
      const locQuery = `query { listStockLocation { id name } }`;
      const locData = await this.graphql(creds, locQuery);
      const locations = locData.listStockLocation || [];
      if (locations.length === 0) {
        return { success: false, variantsUpdated: 0, errors: [{ variantId: 0, sizeName: "", error: "No stock locations found" }] };
      }
      const locationId = locations[0].id;

      for (const v of variants) {
        try {
          const mutation = `
            mutation updateStock($locationId: String!, $variantId: String!, $stock: Int!) {
              updateStockLocationsForProducts(input: {
                stockLocationId: $locationId
                variantStocks: [{ variantId: $variantId, stock: $stock }]
              })
            }
          `;
          await this.graphql(creds, mutation, {
            locationId,
            variantId: v.externalVariantId,
            stock: v.stockQuantity,
          });
          updated++;
        } catch (err: unknown) {
          errors.push({ variantId: 0, sizeName: v.externalVariantId, error: err instanceof Error ? err.message : String(err) });
        }
      }
    } catch (err: unknown) {
      errors.push({ variantId: 0, sizeName: "", error: err instanceof Error ? err.message : String(err) });
    }

    return { success: errors.length === 0, variantsUpdated: updated, errors };
  }

  async updatePrice(
    credentials: MarketplaceCredentials,
    externalProductId: string,
    variants: Array<{ externalVariantId: string; salePrice: number; costPrice?: number }>
  ): Promise<PriceUpdateResult> {
    const creds = credentials as IkasCredentials;
    const errors: PriceUpdateResult["errors"] = [];
    let updated = 0;

    try {
      // Get price lists
      const plQuery = `query { listPriceList { id name } }`;
      const plData = await this.graphql(creds, plQuery);
      const priceLists = plData.listPriceList || [];
      if (priceLists.length === 0) {
        return { success: false, variantsUpdated: 0, errors: [{ variantId: 0, sizeName: "", error: "No price lists found" }] };
      }
      const priceListId = priceLists[0].id;

      const variantPriceInputs = variants.map((v) => ({
        productId: externalProductId,
        variantId: v.externalVariantId,
        price: {
          sellPrice: v.salePrice,
          buyPrice: v.costPrice || 0,
        },
      }));

      const mutation = `
        mutation saveVariantPrices($priceListId: String!, $variantPriceInputs: [VariantPriceInput!]!) {
          saveVariantPrices(priceListId: $priceListId, variantPriceInputs: $variantPriceInputs)
        }
      `;

      await this.graphql(creds, mutation, { priceListId, variantPriceInputs });
      updated = variants.length;
    } catch (err: unknown) {
      errors.push({ variantId: 0, sizeName: "", error: err instanceof Error ? err.message : String(err) });
    }

    return { success: errors.length === 0, variantsUpdated: updated, errors };
  }

  async delistProduct(credentials: MarketplaceCredentials, externalProductId: string): Promise<{ success: boolean; error?: string }> {
    const creds = credentials as IkasCredentials;
    try {
      const mutation = `
        mutation saveProduct($input: ProductInput!) {
          saveProduct(input: $input) { id }
        }
      `;
      await this.graphql(creds, mutation, { input: { id: externalProductId, isActive: false } });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async getCategories(credentials: MarketplaceCredentials): Promise<CategoryNode[]> {
    const creds = credentials as IkasCredentials;
    try {
      const query = `query { listCategory { id name parentId } }`;
      const data = await this.graphql(creds, query);
      const categories = data.listCategory || [];
      return categories.map((c: { id: string; name: string; parentId?: string }) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId || undefined,
      }));
    } catch {
      return [];
    }
  }

  async getCategoryAttributes(
    credentials: MarketplaceCredentials,
    categoryId: string
  ): Promise<CategoryAttribute[]> {
    const creds = credentials as IkasCredentials;
    try {
      const query = `
        query listProductAttribute($categoryId: String) {
          listProductAttribute(categoryId: $categoryId) {
            id
            name
            isRequired
            values { id name }
          }
        }
      `;

      const data = await this.graphql(creds, query, { categoryId });
      const attrs = data.listProductAttribute || [];

      return attrs.map((a: { id: string; name: string; isRequired?: boolean; values?: Array<{ id: string; name: string }> }) => ({
        id: a.id,
        name: a.name,
        required: a.isRequired ?? false,
        values: (a.values || []).map((v: { id: string; name: string }) => ({
          id: v.id,
          name: v.name,
        })),
      }));
    } catch {
      return [];
    }
  }

  async getBrands(
    credentials: MarketplaceCredentials,
    query?: string
  ): Promise<Array<{ id: string; name: string }>> {
    const creds = credentials as IkasCredentials;
    try {
      const gql = `
        query listBrand {
          listBrand {
            id
            name
          }
        }
      `;

      const data = await this.graphql(creds, gql);
      const brands: Array<{ id: string; name: string }> = (data.listBrand || []).map((b: { id: string; name: string }) => ({
        id: b.id,
        name: b.name,
      }));

      if (query) {
        const lowerQuery = query.toLowerCase();
        return brands.filter((b) => b.name.toLowerCase().includes(lowerQuery));
      }

      return brands;
    } catch {
      return [];
    }
  }
}

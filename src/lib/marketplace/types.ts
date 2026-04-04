export type MarketplaceName = "shopify" | "ikas" | "tsoft" | "ideasoft" | "trendyol";

export interface MarketplaceCredentials {
  marketplace: MarketplaceName;
  [key: string]: unknown;
}

export interface MarketplaceProduct {
  productId: number;
  title: string;
  description: string;
  bodyHtml: string;
  images: string[];
  coverImage: string;
  warehouseSku: string;
  skuPrefix?: string;
  categoryMapping?: {
    externalCategoryId: string;
    attributes?: Record<string, string>;
  };
  brandId?: string;
  variants: MarketplaceVariant[];
  metadata?: Record<string, unknown>;
}

export interface MarketplaceVariant {
  variantId: number;
  sizeName: string;
  sku: string;
  barcode?: string;
  costPrice: number;
  salePrice: number;
  stockQuantity: number;
  widthCm: number | null;
  heightCm: number | null;
}

export interface PushResult {
  success: boolean;
  externalProductId?: string;
  externalVariantIds?: Record<string, string>;
  asyncTrackingId?: string;
  error?: string;
}

export interface StockUpdateResult {
  success: boolean;
  variantsUpdated: number;
  errors: Array<{ variantId: number; sizeName: string; error: string }>;
}

export interface PriceUpdateResult {
  success: boolean;
  variantsUpdated: number;
  errors: Array<{ variantId: number; sizeName: string; error: string }>;
}

export interface UpdateResult {
  success: boolean;
  error?: string;
}

export interface CategoryNode {
  id: string;
  name: string;
  parentId?: string;
  children?: CategoryNode[];
}

export interface CategoryAttribute {
  id: string;
  name: string;
  required: boolean;
  values?: Array<{ id: string; name: string }>;
}

export interface MarketplaceAdapter {
  readonly name: MarketplaceName;
  readonly displayName: string;
  readonly isAsync: boolean;
  readonly requiredSettings: string[];

  validateCredentials(credentials: MarketplaceCredentials): Promise<boolean>;

  pushProduct(
    credentials: MarketplaceCredentials,
    product: MarketplaceProduct
  ): Promise<PushResult>;

  updateProduct(
    credentials: MarketplaceCredentials,
    externalProductId: string,
    product: Partial<MarketplaceProduct>
  ): Promise<UpdateResult>;

  updateStock(
    credentials: MarketplaceCredentials,
    externalProductId: string,
    variants: Array<{ externalVariantId: string; stockQuantity: number }>
  ): Promise<StockUpdateResult>;

  updatePrice(
    credentials: MarketplaceCredentials,
    externalProductId: string,
    variants: Array<{ externalVariantId: string; salePrice: number; costPrice?: number }>
  ): Promise<PriceUpdateResult>;

  delistProduct(
    credentials: MarketplaceCredentials,
    externalProductId: string
  ): Promise<{ success: boolean; error?: string }>;

  getCategories?(
    credentials: MarketplaceCredentials,
    parentId?: string
  ): Promise<CategoryNode[]>;

  getCategoryAttributes?(
    credentials: MarketplaceCredentials,
    categoryId: string
  ): Promise<CategoryAttribute[]>;

  getBrands?(
    credentials: MarketplaceCredentials,
    query?: string
  ): Promise<Array<{ id: string; name: string }>>;
}

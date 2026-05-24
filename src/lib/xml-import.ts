import { XMLParser } from "fast-xml-parser";
import { db } from "./db";
import { masterProducts, masterVariants, stockMovements } from "./schema";
import { eq, and } from "drizzle-orm";

// ─── TYPES ────────────────────────────────────────────────

interface IkasImage {
  imageUrl: string;
  isMain?: boolean | string;
  order?: number | string;
}

interface IkasVariantValue {
  variantTypeName?: string;
  variantValueName?: string;
}

interface IkasPrice {
  sellPrice?: string | number;
  discountPrice?: string | number;
  currency?: string;
}

interface IkasStock {
  stockLocationName?: string;
  stockCount?: string | number;
}

interface IkasVariant {
  id?: string;
  sku?: string;
  desi?: string | number;
  barcodeList?: { barcode?: string | string[] };
  images?: { image?: IkasImage | IkasImage[] };
  prices?: { price?: IkasPrice | IkasPrice[] };
  stocks?: { stock?: IkasStock | IkasStock[] };
  hsCode?: string;
  variantValues?: { variantValue?: IkasVariantValue | IkasVariantValue[] };
}

interface IkasProduct {
  id?: string;
  name?: string;
  type?: string;
  brand?: { name?: string };
  categories?: { category?: { id?: string; name?: string } | Array<{ id?: string; name?: string }> };
  description?: string;
  productVariantTypes?: unknown;
  variants?: { variant?: IkasVariant | IkasVariant[] };
}

interface ParsedVariant {
  externalId: string;
  sku: string;
  barcode: string;
  color: string | null;
  size: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  images: string[];
  weight: number | null;
}

interface ParsedProduct {
  externalId: string;
  name: string;
  brand: string;
  category: string | null;
  description: string | null;
  variants: ParsedVariant[];
  productLevelImages: string[];
}

export interface XmlImportResult {
  newProducts: number;
  updatedProducts: number;
  totalVariants: number;
  stockChanges: Array<{
    variantId: number;
    sku: string;
    barcode: string;
    size: string;
    previousStock: number;
    newStock: number;
  }>;
  errors: string[];
}

// ─── HELPERS ──────────────────────────────────────────────

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function deriveMasterSku(externalId: string, name: string): string {
  const slug = slugify(name) || "urun";
  const shortId = externalId.slice(0, 8);
  return `${slug}-${shortId}`;
}

function pickVariantValue(
  variantValues: { variantValue?: IkasVariantValue | IkasVariantValue[] } | undefined,
  typeNames: string[]
): string | null {
  const list = toArray(variantValues?.variantValue);
  for (const vv of list) {
    const typeName = (vv.variantTypeName || "").toLowerCase();
    if (typeNames.some((tn) => typeName.includes(tn.toLowerCase()))) {
      return vv.variantValueName?.toString().trim() || null;
    }
  }
  return null;
}

function sortVariantImages(images: IkasImage[]): string[] {
  return [...images]
    .map((img) => ({
      url: img.imageUrl?.toString().trim() || "",
      isMain: toBool(img.isMain),
      order: toNumber(img.order, 999),
    }))
    .filter((img) => img.url.startsWith("http"))
    .sort((a, b) => {
      if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
      return a.order - b.order;
    })
    .map((img) => img.url);
}

// ─── PARSE XML ────────────────────────────────────────────

export function parseIkasXml(xml: string): { products: ParsedProduct[]; errors: string[] } {
  const errors: string[] = [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  });

  let parsed: { products?: { product?: IkasProduct | IkasProduct[] } };
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    return {
      products: [],
      errors: [`XML parse hatası: ${err instanceof Error ? err.message : "bilinmeyen"}`],
    };
  }

  const rawProducts = toArray(parsed.products?.product);
  if (rawProducts.length === 0) {
    return { products: [], errors: ["XML'de hiç <product> bulunamadı"] };
  }

  const products: ParsedProduct[] = [];

  for (let i = 0; i < rawProducts.length; i++) {
    const p = rawProducts[i];
    const externalId = p.id?.toString().trim();
    if (!externalId) {
      errors.push(`Ürün #${i + 1}: id boş, atlandı`);
      continue;
    }

    const name = p.name?.toString().trim() || "İsimsiz ürün";
    const brand = p.brand?.name?.toString().trim() || "Tano Atelier";
    const categoryList = toArray(p.categories?.category);
    const category = categoryList[0]?.name?.toString().trim() || null;
    const description = p.description?.toString().trim() || null;

    const rawVariants = toArray(p.variants?.variant);
    if (rawVariants.length === 0) {
      errors.push(`Ürün ${name} (${externalId}): varyant yok, atlandı`);
      continue;
    }

    const variants: ParsedVariant[] = [];
    const allImages = new Set<string>();

    for (let j = 0; j < rawVariants.length; j++) {
      const v = rawVariants[j];
      const variantExternalId = v.id?.toString().trim();
      const variantSku = v.sku?.toString().trim();
      if (!variantExternalId || !variantSku) {
        errors.push(`${name}: ${j + 1}. varyant id/sku eksik`);
        continue;
      }

      const barcodes = toArray(v.barcodeList?.barcode).map((b) => b?.toString().trim()).filter(Boolean);
      const barcode = barcodes[0] || variantSku;

      const images = sortVariantImages(toArray(v.images?.image));
      images.forEach((url) => allImages.add(url));

      const prices = toArray(v.prices?.price);
      const firstPrice = prices[0];
      const salePrice = toNumber(firstPrice?.discountPrice ?? firstPrice?.sellPrice, 0);
      const costPrice = toNumber(firstPrice?.sellPrice, 0); // cost yoksa sellPrice'ı koruyoruz

      const stocks = toArray(v.stocks?.stock);
      const totalStock = stocks.reduce((sum, s) => sum + toNumber(s.stockCount, 0), 0);

      const color = pickVariantValue(v.variantValues, ["renk", "color"]);
      const size = pickVariantValue(v.variantValues, ["beden", "size", "numara"]) || "STD";

      const weightVal = toNumber(v.desi, 0);
      const weight = weightVal > 0 ? Math.round(weightVal * 1000) : null;

      variants.push({
        externalId: variantExternalId,
        sku: variantSku,
        barcode,
        color,
        size,
        costPrice: Math.round(costPrice * 100) / 100,
        salePrice: Math.round(salePrice * 100) / 100,
        stock: Math.max(0, Math.round(totalStock)),
        images,
        weight,
      });
    }

    if (variants.length === 0) {
      errors.push(`${name}: geçerli varyant kalmadı`);
      continue;
    }

    products.push({
      externalId,
      name,
      brand,
      category,
      description,
      variants,
      productLevelImages: Array.from(allImages),
    });
  }

  return { products, errors };
}

// ─── PROCESS IMPORT ───────────────────────────────────────

export async function processXmlImport(xml: string): Promise<XmlImportResult> {
  const { products, errors: parseErrors } = parseIkasXml(xml);

  const result: XmlImportResult = {
    newProducts: 0,
    updatedProducts: 0,
    totalVariants: 0,
    stockChanges: [],
    errors: [...parseErrors],
  };

  for (const product of products) {
    try {
      const existing = await db.query.masterProducts.findFirst({
        where: eq(masterProducts.externalId, product.externalId),
      });

      let productId: number;

      if (existing) {
        await db
          .update(masterProducts)
          .set({
            name: product.name,
            brand: product.brand,
            category: product.category,
            description: product.description,
            images:
              existing.images.length > 0 ? existing.images : product.productLevelImages,
            source: "xml",
            updatedAt: new Date(),
          })
          .where(eq(masterProducts.id, existing.id));
        productId = existing.id;
        result.updatedProducts++;
      } else {
        const sku = deriveMasterSku(product.externalId, product.name);
        const [created] = await db
          .insert(masterProducts)
          .values({
            sku,
            externalId: product.externalId,
            name: product.name,
            brand: product.brand,
            category: product.category,
            description: product.description,
            images: product.productLevelImages,
            status: "active",
            source: "xml",
          })
          .returning();
        productId = created.id;
        result.newProducts++;
      }

      for (const v of product.variants) {
        // Eşleme: önce externalId, yoksa barcode
        let existingVariant = await db.query.masterVariants.findFirst({
          where: and(
            eq(masterVariants.masterProductId, productId),
            eq(masterVariants.externalId, v.externalId)
          ),
        });

        if (!existingVariant && v.barcode) {
          existingVariant = await db.query.masterVariants.findFirst({
            where: eq(masterVariants.barcode, v.barcode),
          });
        }

        if (existingVariant) {
          const previousStock = existingVariant.stockQuantity;
          await db
            .update(masterVariants)
            .set({
              externalId: v.externalId,
              sku: v.sku,
              barcode: v.barcode,
              color: v.color,
              size: v.size,
              images: v.images,
              stockQuantity: v.stock,
              costPrice: String(v.costPrice),
              salePrice: String(v.salePrice),
              weight: v.weight,
              updatedAt: new Date(),
            })
            .where(eq(masterVariants.id, existingVariant.id));

          if (previousStock !== v.stock) {
            await db.insert(stockMovements).values({
              masterVariantId: existingVariant.id,
              type: "xml_import",
              quantity: v.stock - previousStock,
              previousStock,
              newStock: v.stock,
              reference: `XML import - ${product.name}`,
            });
            result.stockChanges.push({
              variantId: existingVariant.id,
              sku: existingVariant.sku,
              barcode: existingVariant.barcode,
              size: existingVariant.size,
              previousStock,
              newStock: v.stock,
            });
          }
          result.totalVariants++;
        } else {
          const [created] = await db
            .insert(masterVariants)
            .values({
              masterProductId: productId,
              externalId: v.externalId,
              sku: v.sku,
              barcode: v.barcode,
              color: v.color,
              size: v.size,
              images: v.images,
              stockQuantity: v.stock,
              costPrice: String(v.costPrice),
              salePrice: String(v.salePrice),
              weight: v.weight,
            })
            .returning();

          if (v.stock > 0) {
            await db.insert(stockMovements).values({
              masterVariantId: created.id,
              type: "xml_import",
              quantity: v.stock,
              previousStock: 0,
              newStock: v.stock,
              reference: `XML import (yeni varyant) - ${product.name}`,
            });
            result.stockChanges.push({
              variantId: created.id,
              sku: created.sku,
              barcode: created.barcode,
              size: v.size,
              previousStock: 0,
              newStock: v.stock,
            });
          }
          result.totalVariants++;
        }
      }
    } catch (err) {
      result.errors.push(
        `${product.name} (${product.externalId}): ${err instanceof Error ? err.message : "hata"}`
      );
    }
  }

  return result;
}

// ─── FETCH + IMPORT (URL'den) ─────────────────────────────

export async function importFromUrl(url: string): Promise<XmlImportResult> {
  const res = await fetch(url, {
    headers: { Accept: "application/xml, text/xml, */*" },
  });
  if (!res.ok) {
    return {
      newProducts: 0,
      updatedProducts: 0,
      totalVariants: 0,
      stockChanges: [],
      errors: [`XML çekilemedi: HTTP ${res.status}`],
    };
  }
  const xml = await res.text();
  return processXmlImport(xml);
}

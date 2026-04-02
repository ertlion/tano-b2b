import * as XLSX from "xlsx";
import { db } from "./db";
import {
  masterProducts,
  masterVariants,
  stockMovements,
} from "./schema";
import { eq, and } from "drizzle-orm";

// ─── TYPES ────────────────────────────────────────────────

interface ExcelRow {
  barcode: string;
  name: string;
  sku: string;
  color: string;
  size: string;
  category: string;
  subcategory: string;
  material: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  weight: number | null;
}

interface StockChange {
  variantId: number;
  sku: string;
  barcode: string;
  size: string;
  previousStock: number;
  newStock: number;
}

export interface ImportResult {
  newProducts: number;
  updatedProducts: number;
  totalVariants: number;
  stockChanges: StockChange[];
  errors: string[];
}

// ─── COLUMN MAPPING ───────────────────────────────────────

const COLUMN_MAP: Record<string, keyof ExcelRow> = {
  barkod: "barcode",
  "urun adi": "name",
  "ürün adi": "name",
  "ürün adı": "name",
  "urun adı": "name",
  sku: "sku",
  renk: "color",
  beden: "size",
  kategori: "category",
  "alt kategori": "subcategory",
  "altkategori": "subcategory",
  malzeme: "material",
  "maliyet fiyati": "costPrice",
  "maliyet fiyatı": "costPrice",
  "satis fiyati": "salePrice",
  "satış fiyati": "salePrice",
  "satış fiyatı": "salePrice",
  "satis fiyatı": "salePrice",
  stok: "stock",
  "agirlik (gram)": "weight",
  "ağırlık (gram)": "weight",
  "agirlik": "weight",
  "ağırlık": "weight",
};

function normalizeColumnName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeBarcode(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  let str = String(value).trim();
  // Remove .0 suffix from numbers read as float
  if (/^\d+\.0$/.test(str)) {
    str = str.replace(/\.0$/, "");
  }
  return str;
}

function parseNumber(value: unknown, fallback: number = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return isNaN(num) ? fallback : num;
}

// ─── PARSE EXCEL ──────────────────────────────────────────

function parseExcelBuffer(buffer: Buffer): ExcelRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  // Build header mapping from first row keys
  const headerMap = new Map<string, keyof ExcelRow>();
  if (rawRows.length > 0) {
    for (const rawKey of Object.keys(rawRows[0])) {
      const normalized = normalizeColumnName(rawKey);
      const mapped = COLUMN_MAP[normalized];
      if (mapped) {
        headerMap.set(rawKey, mapped);
      }
    }
  }

  const rows: ExcelRow[] = [];
  for (const rawRow of rawRows) {
    const row: Partial<ExcelRow> = {};
    headerMap.forEach((field, rawKey) => {
      const value = rawRow[rawKey];
      switch (field) {
        case "barcode":
          row.barcode = normalizeBarcode(value);
          break;
        case "name":
          row.name = String(value ?? "").trim();
          break;
        case "sku":
          row.sku = String(value ?? "").trim();
          break;
        case "color":
          row.color = String(value ?? "").trim();
          break;
        case "size":
          row.size = String(value ?? "").trim();
          break;
        case "category":
          row.category = String(value ?? "").trim();
          break;
        case "subcategory":
          row.subcategory = String(value ?? "").trim();
          break;
        case "material":
          row.material = String(value ?? "").trim();
          break;
        case "costPrice":
          row.costPrice = parseNumber(value, 0);
          break;
        case "salePrice":
          row.salePrice = parseNumber(value, 0);
          break;
        case "stock": {
          let stock = Math.round(parseNumber(value, 0));
          if (stock < 0) stock = 0;
          row.stock = stock;
          break;
        }
        case "weight": {
          const w = parseNumber(value, 0);
          row.weight = w > 0 ? Math.round(w) : null;
          break;
        }
      }
    });

    // Skip rows without SKU or barcode (empty rows)
    if (!row.sku && !row.barcode) continue;
    if (!row.sku) continue;

    rows.push({
      barcode: row.barcode || "",
      name: row.name || "",
      sku: row.sku || "",
      color: row.color || "",
      size: row.size || "",
      category: row.category || "",
      subcategory: row.subcategory || "",
      material: row.material || "",
      costPrice: row.costPrice ?? 0,
      salePrice: row.salePrice ?? 0,
      stock: row.stock ?? 0,
      weight: row.weight ?? null,
    });
  }

  return rows;
}

// ─── GROUP BY SKU ─────────────────────────────────────────

interface ProductGroup {
  sku: string;
  name: string;
  color: string;
  category: string;
  subcategory: string;
  material: string;
  variants: Array<{
    barcode: string;
    size: string;
    costPrice: number;
    salePrice: number;
    stock: number;
    weight: number | null;
    variantSku: string;
  }>;
}

function groupBySku(rows: ExcelRow[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();

  for (const row of rows) {
    const existing = map.get(row.sku);
    if (existing) {
      existing.variants.push({
        barcode: row.barcode,
        size: row.size,
        costPrice: row.costPrice,
        salePrice: row.salePrice,
        stock: row.stock,
        weight: row.weight,
        variantSku: row.barcode ? `${row.sku}-${row.size}` : row.sku,
      });
    } else {
      map.set(row.sku, {
        sku: row.sku,
        name: row.name,
        color: row.color,
        category: row.category,
        subcategory: row.subcategory,
        material: row.material,
        variants: [
          {
            barcode: row.barcode,
            size: row.size,
            costPrice: row.costPrice,
            salePrice: row.salePrice,
            stock: row.stock,
            weight: row.weight,
            variantSku: row.barcode ? `${row.sku}-${row.size}` : row.sku,
          },
        ],
      });
    }
  }

  return Array.from(map.values());
}

// ─── PROCESS IMPORT ───────────────────────────────────────

export async function processExcelImport(
  buffer: Buffer
): Promise<ImportResult> {
  const rows = parseExcelBuffer(buffer);

  if (rows.length === 0) {
    return {
      newProducts: 0,
      updatedProducts: 0,
      totalVariants: 0,
      stockChanges: [],
      errors: ["Excel dosyasinda gecerli veri bulunamadi"],
    };
  }

  const groups = groupBySku(rows);
  const result: ImportResult = {
    newProducts: 0,
    updatedProducts: 0,
    totalVariants: 0,
    stockChanges: [],
    errors: [],
  };

  for (const group of groups) {
    try {
      // Check if product already exists by SKU
      const existing = await db.query.masterProducts.findFirst({
        where: eq(masterProducts.sku, group.sku),
      });

      if (existing) {
        // ── UPDATE EXISTING PRODUCT ─────────────────────
        await db
          .update(masterProducts)
          .set({
            name: group.name || existing.name,
            color: group.color || existing.color,
            category: group.category || existing.category,
            subcategory: group.subcategory || existing.subcategory,
            material: group.material || existing.material,
            updatedAt: new Date(),
          })
          .where(eq(masterProducts.id, existing.id));

        for (const v of group.variants) {
          const existingVariant = await db.query.masterVariants.findFirst({
            where: and(
              eq(masterVariants.masterProductId, existing.id),
              eq(masterVariants.barcode, v.barcode)
            ),
          });

          if (existingVariant) {
            const previousStock = existingVariant.stockQuantity;
            const newStock = v.stock;

            await db
              .update(masterVariants)
              .set({
                stockQuantity: newStock,
                costPrice: String(v.costPrice),
                salePrice: String(v.salePrice),
                weight: v.weight,
                updatedAt: new Date(),
              })
              .where(eq(masterVariants.id, existingVariant.id));

            if (previousStock !== newStock) {
              await db.insert(stockMovements).values({
                masterVariantId: existingVariant.id,
                type: "excel_import",
                quantity: newStock - previousStock,
                previousStock,
                newStock,
                reference: `Excel import - SKU: ${group.sku}`,
              });

              result.stockChanges.push({
                variantId: existingVariant.id,
                sku: existingVariant.sku,
                barcode: existingVariant.barcode,
                size: existingVariant.size,
                previousStock,
                newStock,
              });
            }

            result.totalVariants++;
          } else {
            // New variant for existing product
            const [newVariant] = await db
              .insert(masterVariants)
              .values({
                masterProductId: existing.id,
                size: v.size,
                barcode: v.barcode,
                sku: v.variantSku,
                stockQuantity: v.stock,
                costPrice: String(v.costPrice),
                salePrice: String(v.salePrice),
                weight: v.weight,
              })
              .returning();

            if (v.stock > 0) {
              await db.insert(stockMovements).values({
                masterVariantId: newVariant.id,
                type: "excel_import",
                quantity: v.stock,
                previousStock: 0,
                newStock: v.stock,
                reference: `Excel import (new variant) - SKU: ${group.sku}`,
              });

              result.stockChanges.push({
                variantId: newVariant.id,
                sku: newVariant.sku,
                barcode: newVariant.barcode,
                size: v.size,
                previousStock: 0,
                newStock: v.stock,
              });
            }

            result.totalVariants++;
          }
        }

        result.updatedProducts++;
      } else {
        // ── CREATE NEW PRODUCT ──────────────────────────
        const [newProduct] = await db
          .insert(masterProducts)
          .values({
            sku: group.sku,
            barcode: group.variants[0]?.barcode || null,
            name: group.name,
            color: group.color || null,
            category: group.category || null,
            subcategory: group.subcategory || null,
            material: group.material || null,
            status: "active",
          })
          .returning();

        for (const v of group.variants) {
          const [newVariant] = await db
            .insert(masterVariants)
            .values({
              masterProductId: newProduct.id,
              size: v.size,
              barcode: v.barcode,
              sku: v.variantSku,
              stockQuantity: v.stock,
              costPrice: String(v.costPrice),
              salePrice: String(v.salePrice),
              weight: v.weight,
            })
            .returning();

          if (v.stock > 0) {
            await db.insert(stockMovements).values({
              masterVariantId: newVariant.id,
              type: "excel_import",
              quantity: v.stock,
              previousStock: 0,
              newStock: v.stock,
              reference: `Excel import (new product) - SKU: ${group.sku}`,
            });

            result.stockChanges.push({
              variantId: newVariant.id,
              sku: newVariant.sku,
              barcode: newVariant.barcode,
              size: v.size,
              previousStock: 0,
              newStock: v.stock,
            });
          }

          result.totalVariants++;
        }

        result.newProducts++;
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`SKU ${group.sku}: ${message}`);
    }
  }

  return result;
}

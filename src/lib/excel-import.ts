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
  imageUrl: string;
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

// ─── BARCODE NORMALIZATION (from goods/tanoatelier logic) ──

function normalizeBarcode(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  // Handle numbers directly (avoid scientific notation)
  if (typeof value === "number") {
    if (isNaN(value)) return "";
    return Math.round(value).toString();
  }

  let s = String(value).trim();
  // Remove all spaces
  s = s.replace(/\s+/g, "");
  if (!s) return "";

  // Handle Turkish Excel comma as decimal (e.g. 2,028E+12)
  const sDotted = s.replace(",", ".");

  const isScientific = /^[-+]?\d*\.?\d+[eE][-+]?\d+$/.test(sDotted);
  const isFloatNum = /^[-+]?\d*\.?\d+$/.test(sDotted);

  if (isScientific || isFloatNum) {
    try {
      const f = parseFloat(sDotted);
      if (Number.isInteger(f) || isScientific) {
        s = f.toFixed(0);
      }
    } catch {
      // keep original
    }
  }

  // Remove trailing .0
  if (s.endsWith(".0")) {
    s = s.slice(0, -2);
  }

  return s.toUpperCase();
}

function parsePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(",", ".");
  s = s.replace(/[^\d.\-]/g, "");
  // Handle multiple dots: keep only last one as decimal
  if ((s.match(/\./g) || []).length > 1) {
    const parts = s.split(".");
    const last = parts.pop();
    s = parts.join("") + "." + last;
  }
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

function parseNumber(value: unknown, fallback: number = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return isNaN(num) ? fallback : num;
}

// ─── COLUMN FINDER ────────────────────────────────────────

function normalizeColumnName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumn(
  headers: Map<string, string>,
  ...candidates: string[]
): string | null {
  // Exact match first
  for (const c of candidates) {
    const found = headers.get(c);
    if (found) return found;
  }
  // Partial match: header contains candidate or candidate contains header
  let result: string | null = null;
  headers.forEach((original, normalized) => {
    if (result) return;
    for (const c of candidates) {
      if (normalized.includes(c) || c.includes(normalized)) {
        result = original;
        return;
      }
    }
  });
  return result;
}

// ─── PARSE EXCEL ──────────────────────────────────────────

function parseExcelBuffer(buffer: Buffer, dollarRate: number): { rows: ExcelRow[]; errors: string[] } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], errors: ["Excel dosyasında sheet bulunamadı"] };

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  if (rawRows.length === 0) return { rows: [], errors: ["Excel dosyasında veri bulunamadı"] };

  // Build normalized header map: normalized_name -> original_key
  const headerMap = new Map<string, string>();
  for (const rawKey of Object.keys(rawRows[0])) {
    headerMap.set(normalizeColumnName(rawKey), rawKey);
  }

  // Find columns (goods/mcapp format + simple format)
  const barcodeCol = findColumn(headerMap, "barkod", "barcode", "barkod listesi", "sku");
  const skuCol = findColumn(headerMap, "ürün kodu", "urun kodu", "sku", "reference") || barcodeCol;
  const nameCol = findColumn(headerMap, "ürün adı", "urun adi", "ürün adi", "urun adı", "name", "başlık", "baslik", "title", "isim");
  const categoryCol = findColumn(headerMap, "kategori", "category", "kategoriler");
  const colorCol = findColumn(headerMap, "renk", "color");
  const sizeCol = findColumn(headerMap, "beden", "size");
  const materialCol = findColumn(headerMap, "malzeme", "material");
  const imageCol = findColumn(headerMap, "görsel url", "gorsel url", "image_url", "image", "resim", "görsel", "resim url");
  const subcategoryCol = findColumn(headerMap, "alt kategori", "altkategori", "subcategory");
  const weightCol = findColumn(headerMap, "ağırlık (gram)", "agirlik (gram)", "ağırlık", "agirlik", "weight");

  // Log found/missing columns for debugging
  const columnLog: string[] = [];
  const allHeaders: string[] = [];
  headerMap.forEach((_orig, norm) => allHeaders.push(norm));
  columnLog.push(`Excel kolonları: ${allHeaders.join(", ")}`);
  columnLog.push(`Eşleşen: barkod=${barcodeCol ? "✓" : "✗"}, sku=${skuCol ? "✓" : "✗"}, ad=${nameCol ? "✓" : "✗"}, renk=${colorCol ? "✓" : "✗"}, beden=${sizeCol ? "✓" : "✗"}, kategori=${categoryCol ? "✓" : "✗"}`);

  if (!barcodeCol && !skuCol) {
    return { rows: [], errors: ["'Barkod' veya 'SKU' sütunu bulunamadı", ...columnLog] };
  }

  // ── Stock calculation (goods/mcapp format): (L × I) + M ──
  // L: "My Fashion 3Seri Miktarı"
  // I: "Birim (kaç adet)"
  // M: "My Fashion 3Adet Miktarı (Seri dışı)"
  const colL = findColumn(headerMap,
    "my fashion 3seri miktarı", "my fashion 3seri miktari",
    "seri miktarı", "seri miktari"
  );
  const colI = findColumn(headerMap,
    "birim (kaç adet)", "birim (kac adet)", "birim (adet)", "birim", "unit (quantity)"
  );
  const colM = findColumn(headerMap,
    "my fashion 3adet miktarı (seri dışı)", "my fashion 3adet miktari (seri disi)",
    "my fashion 3adet miktarı", "my fashion 3adet miktari"
  );

  // Simple stock column fallback
  const simpleStockCol = findColumn(headerMap,
    "my fashion 3stock", "stock", "stok", "miktar", "quantity"
  );

  const useGoodsStockFormula = colL !== null && (colI !== null || colM !== null);

  // ── Price columns ──
  // Cost price: maliyet/fiyat (excluding satış)
  let costPriceCol: string | null = null;
  const salePriceCol = findColumn(headerMap,
    "satış fiyatı", "satis fiyati", "satış fiyati", "satis fiyatı",
    "satış fiyatı", "sale price", "selling price"
  );

  // Find cost price column (any price column NOT containing satış/satis)
  headerMap.forEach((original, normalized) => {
    if (!costPriceCol &&
        (normalized.includes("fiyat") || normalized.includes("price") || normalized.includes("maliyet") || normalized.includes("cost")) &&
        !normalized.includes("satış") && !normalized.includes("satis") && !normalized.includes("sale") && !normalized.includes("selling")) {
      costPriceCol = original;
    }
  });

  // Detect if this is goods/mcapp format (has My Fashion columns)
  let isGoodsFormat = colL !== null;
  headerMap.forEach((_original, normalized) => {
    if (normalized.includes("my fashion")) isGoodsFormat = true;
  });

  const errors: string[] = [];
  const rows: ExcelRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];

    const barcode = normalizeBarcode(barcodeCol ? raw[barcodeCol] : "");
    const sku = skuCol ? String(raw[skuCol] ?? "").trim() : barcode;

    // Skip empty rows
    if (!sku && !barcode) continue;

    // ── Calculate stock ──
    let stock = 0;
    if (useGoodsStockFormula) {
      const L = parseNumber(colL ? raw[colL] : 0);
      const I = colI ? parseNumber(raw[colI], 1) : 1;
      const M = colM ? parseNumber(raw[colM]) : 0;
      stock = Math.round(L * I + M);
    } else if (simpleStockCol) {
      stock = Math.round(parseNumber(raw[simpleStockCol]));
    }
    if (stock < 0) stock = 0;

    // ── Calculate prices ──
    let costPrice = 0;
    let salePrice = 0;

    if (isGoodsFormat && costPriceCol) {
      // Goods format: price is in USD, convert to TRY
      const rawPrice = parsePrice(raw[costPriceCol]);
      if (rawPrice !== null) {
        costPrice = rawPrice * dollarRate * 1.1;
        // Sale price formula: floor(cost × 2.2), round to nearest 10 + 9.99
        const basePrice = Math.floor(costPrice * 2.2);
        salePrice = Math.floor(basePrice / 10) * 10 + 9.99;
      }
    } else {
      // Simple format: direct TRY values
      if (costPriceCol) {
        costPrice = parsePrice(raw[costPriceCol]) ?? 0;
      }
      if (salePriceCol) {
        salePrice = parsePrice(raw[salePriceCol]) ?? 0;
      }
    }

    const name = nameCol ? String(raw[nameCol] ?? "").trim() : "";
    const color = colorCol ? String(raw[colorCol] ?? "").trim() : "";
    const size = sizeCol ? String(raw[sizeCol] ?? "").trim() : "";
    const category = categoryCol ? String(raw[categoryCol] ?? "").trim() : "";
    const subcategory = subcategoryCol ? String(raw[subcategoryCol] ?? "").trim() : "";
    const material = materialCol ? String(raw[materialCol] ?? "").trim() : "";
    const imageUrl = imageCol ? String(raw[imageCol] ?? "").trim() : "";
    const weight = weightCol ? (() => { const w = parseNumber(raw[weightCol]); return w > 0 ? Math.round(w) : null; })() : null;

    if (!sku) {
      errors.push(`Satır ${i + 2}: SKU boş, atlandı`);
      continue;
    }

    rows.push({
      barcode,
      name,
      sku,
      color,
      size,
      category,
      subcategory,
      material,
      costPrice: Math.round(costPrice * 100) / 100,
      salePrice: Math.round(salePrice * 100) / 100,
      stock,
      weight,
      imageUrl,
    });
  }

  return { rows, errors: [...columnLog, ...errors] };
}

// ─── GROUP BY SKU ─────────────────────────────────────────

interface ProductGroup {
  sku: string;
  name: string;
  color: string;
  category: string;
  subcategory: string;
  material: string;
  imageUrl: string;
  variants: Array<{
    barcode: string;
    size: string;
    color: string;
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
    const groupKey = row.sku;
    const existing = map.get(groupKey);
    const variantSku = row.barcode ? `${row.sku}-${row.size || row.barcode}` : row.sku;

    if (existing) {
      existing.variants.push({
        barcode: row.barcode,
        size: row.size,
        color: row.color,
        costPrice: row.costPrice,
        salePrice: row.salePrice,
        stock: row.stock,
        weight: row.weight,
        variantSku,
      });
      // Update name/color etc from first non-empty value
      if (!existing.name && row.name) existing.name = row.name;
      if (!existing.color && row.color) existing.color = row.color;
      if (!existing.imageUrl && row.imageUrl) existing.imageUrl = row.imageUrl;
    } else {
      map.set(groupKey, {
        sku: row.sku,
        name: row.name,
        color: row.color,
        category: row.category,
        subcategory: row.subcategory,
        material: row.material,
        imageUrl: row.imageUrl,
        variants: [{
          barcode: row.barcode,
          size: row.size,
          color: row.color,
          costPrice: row.costPrice,
          salePrice: row.salePrice,
          stock: row.stock,
          weight: row.weight,
          variantSku,
        }],
      });
    }
  }

  return Array.from(map.values());
}

// ─── PROCESS IMPORT ───────────────────────────────────────

export async function processExcelImport(
  buffer: Buffer,
  dollarRate: number = 34.0,
): Promise<ImportResult> {
  const { rows, errors: parseErrors } = parseExcelBuffer(buffer, dollarRate);

  if (rows.length === 0) {
    return {
      newProducts: 0,
      updatedProducts: 0,
      totalVariants: 0,
      stockChanges: [],
      errors: parseErrors.length > 0 ? parseErrors : ["Excel dosyasında geçerli veri bulunamadı"],
    };
  }

  const groups = groupBySku(rows);
  const result: ImportResult = {
    newProducts: 0,
    updatedProducts: 0,
    totalVariants: 0,
    stockChanges: [],
    errors: [...parseErrors],
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
            images: group.imageUrl && existing.images.length === 0
              ? [group.imageUrl]
              : existing.images,
            updatedAt: new Date(),
          })
          .where(eq(masterProducts.id, existing.id));

        for (const v of group.variants) {
          // Match by barcode OR by size if barcode empty
          let existingVariant = v.barcode
            ? await db.query.masterVariants.findFirst({
                where: and(
                  eq(masterVariants.masterProductId, existing.id),
                  eq(masterVariants.barcode, v.barcode)
                ),
              })
            : null;

          if (!existingVariant && v.size) {
            existingVariant = await db.query.masterVariants.findFirst({
              where: and(
                eq(masterVariants.masterProductId, existing.id),
                eq(masterVariants.size, v.size)
              ),
            });
          }

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
                barcode: v.barcode || existingVariant.barcode,
                color: v.color || existingVariant.color,
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
                size: v.size || "STD",
                barcode: v.barcode || `${group.sku}-${v.size || Date.now()}`,
                sku: v.variantSku,
                stockQuantity: v.stock,
                costPrice: String(v.costPrice),
                salePrice: String(v.salePrice),
                weight: v.weight,
                color: v.color || null,
              })
              .returning();

            if (v.stock > 0) {
              await db.insert(stockMovements).values({
                masterVariantId: newVariant.id,
                type: "excel_import",
                quantity: v.stock,
                previousStock: 0,
                newStock: v.stock,
                reference: `Excel import (yeni varyant) - SKU: ${group.sku}`,
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
            name: group.name || group.sku,
            color: group.color || null,
            category: group.category || null,
            subcategory: group.subcategory || null,
            material: group.material || null,
            images: group.imageUrl ? [group.imageUrl] : [],
            status: "active",
          })
          .returning();

        for (const v of group.variants) {
          const [newVariant] = await db
            .insert(masterVariants)
            .values({
              masterProductId: newProduct.id,
              size: v.size || "STD",
              barcode: v.barcode || `${group.sku}-${v.size || Date.now()}`,
              sku: v.variantSku,
              stockQuantity: v.stock,
              costPrice: String(v.costPrice),
              salePrice: String(v.salePrice),
              weight: v.weight,
              color: v.color || null,
            })
            .returning();

          if (v.stock > 0) {
            await db.insert(stockMovements).values({
              masterVariantId: newVariant.id,
              type: "excel_import",
              quantity: v.stock,
              previousStock: 0,
              newStock: v.stock,
              reference: `Excel import (yeni ürün) - SKU: ${group.sku}`,
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
      const message = err instanceof Error ? err.message : "Bilinmeyen hata";
      result.errors.push(`SKU ${group.sku}: ${message}`);
    }
  }

  return result;
}

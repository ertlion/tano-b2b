import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { masterProducts, masterVariants } from "@/lib/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const category = searchParams.get("category")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [];
    if (search) {
      conditions.push(
        sql`(${masterProducts.name} ILIKE ${"%" + search + "%"} OR ${masterProducts.sku} ILIKE ${"%" + search + "%"})`
      );
    }
    if (category) {
      conditions.push(eq(masterProducts.category, category));
    }
    if (status) {
      conditions.push(eq(masterProducts.status, status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(masterProducts)
      .where(where);

    const total = countResult?.total ?? 0;

    // Fetch products
    const products = await db.query.masterProducts.findMany({
      where,
      with: {
        masterVariants: {
          orderBy: (v, { asc }) => [asc(v.size)],
        },
      },
      orderBy: [desc(masterProducts.updatedAt)],
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/PRODUCTS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

interface VariantInput {
  size: string;
  barcode: string;
  color?: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  weight?: number;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();

    const { name, sku, barcode, category, subcategory, color, material, description, variants } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Ürün adı zorunludur" }, { status: 400 });
    }
    if (!sku || typeof sku !== "string" || !sku.trim()) {
      return NextResponse.json({ error: "SKU zorunludur" }, { status: 400 });
    }

    // Check SKU uniqueness
    const existingProduct = await db.query.masterProducts.findFirst({
      where: eq(masterProducts.sku, sku.trim()),
    });

    if (existingProduct) {
      return NextResponse.json({ error: "Bu SKU zaten kullanılıyor" }, { status: 409 });
    }

    // Insert master product
    const [newProduct] = await db
      .insert(masterProducts)
      .values({
        name: name.trim(),
        sku: sku.trim(),
        barcode: barcode?.trim() || null,
        category: category?.trim() || null,
        subcategory: subcategory?.trim() || null,
        color: color?.trim() || null,
        material: material?.trim() || null,
        description: description?.trim() || null,
        status: "active",
      })
      .returning();

    // Insert variants if provided
    const createdVariants = [];
    if (Array.isArray(variants) && variants.length > 0) {
      for (const v of variants as VariantInput[]) {
        if (!v.size || !v.barcode) continue;

        const variantSku = `${sku.trim()}-${v.size}`;
        const [created] = await db
          .insert(masterVariants)
          .values({
            masterProductId: newProduct.id,
            size: v.size.trim(),
            barcode: v.barcode.trim(),
            sku: variantSku,
            costPrice: String(v.costPrice || 0),
            salePrice: String(v.salePrice || 0),
            stockQuantity: v.stock || 0,
            weight: v.weight || null,
            color: v.color?.trim() || null,
          })
          .returning();
        createdVariants.push(created);
      }
    }

    // Fetch the complete product with variants
    const product = await db.query.masterProducts.findFirst({
      where: eq(masterProducts.id, newProduct.id),
      with: {
        masterVariants: {
          orderBy: (v, { asc }) => [asc(v.size)],
        },
      },
    });

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/PRODUCTS] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

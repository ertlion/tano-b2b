import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { masterProducts, masterVariants } from "@/lib/schema";
import { eq, and, inArray } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return NextResponse.json({ error: "Geçersiz ürün ID" }, { status: 400 });
    }

    const product = await db.query.masterProducts.findFirst({
      where: eq(masterProducts.id, productId),
      with: {
        masterVariants: {
          orderBy: (v, { asc }) => [asc(v.size)],
          with: {
            stockMovements: {
              orderBy: (sm, { desc }) => [desc(sm.createdAt)],
              limit: 10,
            },
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/PRODUCTS/:id] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return NextResponse.json({ error: "Geçersiz ürün ID" }, { status: 400 });
    }

    const body = await request.json();

    const existing = await db.query.masterProducts.findFirst({
      where: eq(masterProducts.id, productId),
    });

    if (!existing) {
      return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });
    }

    // Only allow updating specific fields
    const allowedFields: (keyof typeof masterProducts.$inferInsert)[] = [
      "name",
      "description",
      "category",
      "subcategory",
      "color",
      "material",
      "brand",
      "status",
      "images",
    ];

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const [updated] = await db
      .update(masterProducts)
      .set(updateData)
      .where(eq(masterProducts.id, productId))
      .returning();

    // Handle variant upsert if variants array is provided
    if (Array.isArray(body.variants)) {
      const incomingVariants = body.variants as Array<{
        id?: number;
        size: string;
        barcode: string;
        costPrice: number;
        salePrice: number;
        stock: number;
        weight?: number;
        _delete?: boolean;
      }>;

      // Get existing variants
      const existingVariants = await db.query.masterVariants.findMany({
        where: eq(masterVariants.masterProductId, productId),
      });
      const existingIds = existingVariants.map((v) => v.id);

      // Delete variants marked for deletion
      const toDelete = incomingVariants
        .filter((v) => v._delete && v.id)
        .map((v) => v.id!);
      if (toDelete.length > 0) {
        await db
          .delete(masterVariants)
          .where(and(eq(masterVariants.masterProductId, productId), inArray(masterVariants.id, toDelete)));
      }

      // Update existing variants
      for (const v of incomingVariants.filter((v) => v.id && !v._delete && existingIds.includes(v.id!))) {
        await db
          .update(masterVariants)
          .set({
            size: v.size?.trim(),
            barcode: v.barcode?.trim(),
            costPrice: String(v.costPrice ?? 0),
            salePrice: String(v.salePrice ?? 0),
            stockQuantity: v.stock ?? 0,
            weight: v.weight ?? null,
            updatedAt: new Date(),
          })
          .where(eq(masterVariants.id, v.id!));
      }

      // Create new variants (no id)
      for (const v of incomingVariants.filter((v) => !v.id && !v._delete)) {
        if (!v.size || !v.barcode) continue;
        const variantSku = `${updated.sku}-${v.size.trim()}`;
        await db.insert(masterVariants).values({
          masterProductId: productId,
          size: v.size.trim(),
          barcode: v.barcode.trim(),
          sku: variantSku,
          costPrice: String(v.costPrice ?? 0),
          salePrice: String(v.salePrice ?? 0),
          stockQuantity: v.stock ?? 0,
          weight: v.weight ?? null,
        });
      }
    }

    // Fetch updated product with variants
    const product = await db.query.masterProducts.findFirst({
      where: eq(masterProducts.id, productId),
      with: {
        masterVariants: {
          orderBy: (v, { asc }) => [asc(v.size)],
        },
      },
    });

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/PRODUCTS/:id] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return NextResponse.json({ error: "Geçersiz ürün ID" }, { status: 400 });
    }

    const existing = await db.query.masterProducts.findFirst({
      where: eq(masterProducts.id, productId),
    });

    if (!existing) {
      return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });
    }

    const [updated] = await db
      .update(masterProducts)
      .set({ status: "passive", updatedAt: new Date() })
      .where(eq(masterProducts.id, productId))
      .returning();

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/PRODUCTS/:id] DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

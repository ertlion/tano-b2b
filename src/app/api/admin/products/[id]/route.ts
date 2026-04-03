import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { masterProducts } from "@/lib/schema";
import { eq } from "drizzle-orm";

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

    return NextResponse.json({ success: true, data: updated });
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

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { masterProducts } from "@/lib/schema";
import { eq } from "drizzle-orm";

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return NextResponse.json({ error: "Gecersiz urun ID" }, { status: 400 });
    }

    const product = await db.query.masterProducts.findFirst({
      where: eq(masterProducts.id, productId),
      columns: { id: true, images: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Urun bulunamadi" }, { status: 404 });
    }

    const currentImages = product.images || [];
    if (currentImages.length >= MAX_IMAGES) {
      return NextResponse.json(
        { error: `En fazla ${MAX_IMAGES} gorsel yuklenebilir` },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Dosya bulunamadi" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Desteklenmeyen dosya tipi. JPEG, PNG veya WebP yukleyin." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Dosya boyutu 2MB'dan buyuk olamaz" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    const updatedImages = [...currentImages, dataUrl];

    const [updated] = await db
      .update(masterProducts)
      .set({ images: updatedImages, updatedAt: new Date() })
      .where(eq(masterProducts.id, productId))
      .returning();

    return NextResponse.json({
      success: true,
      data: { images: updated.images },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/PRODUCTS/:id/images] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return NextResponse.json({ error: "Gecersiz urun ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const index = parseInt(searchParams.get("index") || "");

    if (isNaN(index) || index < 0) {
      return NextResponse.json({ error: "Gecersiz gorsel index" }, { status: 400 });
    }

    const product = await db.query.masterProducts.findFirst({
      where: eq(masterProducts.id, productId),
      columns: { id: true, images: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Urun bulunamadi" }, { status: 404 });
    }

    const currentImages = product.images || [];
    if (index >= currentImages.length) {
      return NextResponse.json({ error: "Gorsel bulunamadi" }, { status: 404 });
    }

    const updatedImages = currentImages.filter((_, i) => i !== index);

    const [updated] = await db
      .update(masterProducts)
      .set({ images: updatedImages, updatedAt: new Date() })
      .where(eq(masterProducts.id, productId))
      .returning();

    return NextResponse.json({
      success: true,
      data: { images: updated.images },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/PRODUCTS/:id/images] DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

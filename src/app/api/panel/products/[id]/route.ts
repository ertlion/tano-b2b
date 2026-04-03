import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants, masterProducts } from "@/lib/schema";
import { eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = await requireAuth(request);
    const { id } = await params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return NextResponse.json({ error: "Geçersiz ürün ID" }, { status: 400 });
    }

    // Fetch tenant's discount rate
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { discountRate: true },
    });
    const discountRate = Number(tenant?.discountRate ?? 0);

    const product = await db.query.masterProducts.findFirst({
      where: eq(masterProducts.id, productId),
      with: {
        masterVariants: {
          orderBy: (v, { asc }) => [asc(v.color), asc(v.size)],
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });
    }

    const data = {
      ...product,
      masterVariants: product.masterVariants.map((v) => {
        const salePrice = Number(v.salePrice);
        const customerPrice = discountRate > 0
          ? salePrice * (1 - discountRate / 100)
          : salePrice;
        return {
          ...v,
          customerPrice: customerPrice.toFixed(2),
        };
      }),
    };

    return NextResponse.json({
      success: true,
      data,
      meta: { discountRate },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/PRODUCTS/:id] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

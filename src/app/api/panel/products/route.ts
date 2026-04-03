import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  tenantProducts,
  masterProducts,
} from "@/lib/schema";
import { eq, and, sql, notInArray, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab") || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    if (tab === "new") {
      // Master products NOT yet in this tenant's tenantProducts
      const existingProductIds = db
        .select({ masterProductId: tenantProducts.masterProductId })
        .from(tenantProducts)
        .where(eq(tenantProducts.tenantId, tenantId));

      const [countResult] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(masterProducts)
        .where(
          and(
            eq(masterProducts.status, "active"),
            notInArray(masterProducts.id, existingProductIds)
          )
        );

      const products = await db.query.masterProducts.findMany({
        where: and(
          eq(masterProducts.status, "active"),
          notInArray(masterProducts.id, existingProductIds)
        ),
        with: {
          masterVariants: true,
        },
        orderBy: [desc(masterProducts.createdAt)],
        limit,
        offset,
      });

      return NextResponse.json({
        success: true,
        data: products,
        meta: {
          total: countResult?.total ?? 0,
          page,
          limit,
          totalPages: Math.ceil((countResult?.total ?? 0) / limit),
        },
      });
    }

    if (tab === "active") {
      // Tenant's active products with master product details
      const [countResult] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(tenantProducts)
        .where(
          and(
            eq(tenantProducts.tenantId, tenantId),
            eq(tenantProducts.status, "active")
          )
        );

      const products = await db.query.tenantProducts.findMany({
        where: and(
          eq(tenantProducts.tenantId, tenantId),
          eq(tenantProducts.status, "active")
        ),
        with: {
          masterProduct: {
            with: {
              masterVariants: true,
            },
          },
        },
        orderBy: [desc(tenantProducts.createdAt)],
        limit,
        offset,
      });

      return NextResponse.json({
        success: true,
        data: products,
        meta: {
          total: countResult?.total ?? 0,
          page,
          limit,
          totalPages: Math.ceil((countResult?.total ?? 0) / limit),
        },
      });
    }

    // tab === "all" - all tenant products
    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(tenantProducts)
      .where(eq(tenantProducts.tenantId, tenantId));

    const products = await db.query.tenantProducts.findMany({
      where: eq(tenantProducts.tenantId, tenantId),
      with: {
        masterProduct: {
          with: {
            masterVariants: true,
          },
        },
      },
      orderBy: [desc(tenantProducts.createdAt)],
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: products,
      meta: {
        total: countResult?.total ?? 0,
        page,
        limit,
        totalPages: Math.ceil((countResult?.total ?? 0) / limit),
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/PRODUCTS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

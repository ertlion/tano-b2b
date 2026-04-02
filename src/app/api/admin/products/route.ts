import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { masterProducts, masterVariants } from "@/lib/schema";
import { eq, like, and, sql, desc } from "drizzle-orm";

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
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

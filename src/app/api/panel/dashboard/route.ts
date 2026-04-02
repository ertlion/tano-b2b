import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  tenantProducts,
  masterProducts,
  orders,
} from "@/lib/schema";
import { eq, and, sql, desc, notInArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    // Active products count
    const [activeResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantProducts)
      .where(
        and(
          eq(tenantProducts.tenantId, tenantId),
          eq(tenantProducts.status, "active")
        )
      );

    // Pending products: master products NOT in tenant's tenantProducts
    const existingProductIds = db
      .select({ masterProductId: tenantProducts.masterProductId })
      .from(tenantProducts)
      .where(eq(tenantProducts.tenantId, tenantId));

    const [pendingResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(masterProducts)
      .where(
        and(
          eq(masterProducts.status, "active"),
          notInArray(masterProducts.id, existingProductIds)
        )
      );

    // Total orders
    const [totalOrdersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.tenantId, tenantId));

    // Pending orders (status = new)
    const [pendingOrdersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(eq(orders.tenantId, tenantId), eq(orders.status, "new"))
      );

    // Recent orders (last 5)
    const recentOrders = await db.query.orders.findMany({
      where: eq(orders.tenantId, tenantId),
      orderBy: [desc(orders.createdAt)],
      limit: 5,
      columns: {
        id: true,
        orderNumber: true,
        customerName: true,
        totalAmount: true,
        currency: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        activeProducts: activeResult?.count ?? 0,
        pendingProducts: pendingResult?.count ?? 0,
        totalOrders: totalOrdersResult?.count ?? 0,
        pendingOrders: pendingOrdersResult?.count ?? 0,
        recentOrders,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/DASHBOARD] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

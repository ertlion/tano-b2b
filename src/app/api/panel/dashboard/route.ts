import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  masterProducts,
  orders,
  tenants,
} from "@/lib/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    // Count all active master products (full catalog)
    const [catalogResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(masterProducts)
      .where(eq(masterProducts.status, "active"));

    // Get tenant's discount rate
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { discountRate: true },
    });

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
        catalogProducts: catalogResult?.count ?? 0,
        discountRate: Number(tenant?.discountRate ?? 0),
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
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

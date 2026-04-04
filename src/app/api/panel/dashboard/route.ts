import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  masterProducts,
  masterVariants,
  orders,
  tenants,
  tenantProducts,
} from "@/lib/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    // Tenant info
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { discountRate: true },
    });
    const discountRate = Number(tenant?.discountRate ?? 0);

    // Pushed products count
    const [pushedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantProducts)
      .where(eq(tenantProducts.tenantId, tenantId));

    // Catalog count
    const [catalogCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(masterProducts)
      .where(eq(masterProducts.status, "active"));

    // Total orders
    const [totalOrdersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.tenantId, tenantId));

    // Pending orders
    const [pendingOrdersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.status, "new")));

    // Sales summary — today and this month
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // All orders for this tenant (for cost calculation)
    const allOrders = await db.query.orders.findMany({
      where: eq(orders.tenantId, tenantId),
      columns: { id: true, totalAmount: true, items: true, status: true, createdAt: true },
    });

    // Build variant cost cache
    const variantCostCache = new Map<number, number>();

    async function getVariantCost(variantId: number): Promise<number> {
      if (variantCostCache.has(variantId)) return variantCostCache.get(variantId)!;
      const v = await db.query.masterVariants.findFirst({
        where: eq(masterVariants.id, variantId),
        columns: { costPrice: true },
      });
      const cost = Number(v?.costPrice ?? 0);
      variantCostCache.set(variantId, cost);
      return cost;
    }

    // Calculate sales & cost per period
    let todaySales = 0, todayCost = 0, todayOrders = 0;
    let monthSales = 0, monthCost = 0, monthOrders = 0;
    let totalSales = 0, totalCost = 0;

    for (const order of allOrders) {
      if (order.status === "cancelled") continue;

      const orderAmount = Number(order.totalAmount);
      const orderDate = new Date(order.createdAt);
      const items = order.items as Array<{ masterVariantId?: number; quantity?: number; unitPrice?: number }> | null;

      // Calculate cost from items
      let orderCost = 0;
      if (items && Array.isArray(items)) {
        for (const item of items) {
          if (item.masterVariantId && item.quantity) {
            const unitCost = await getVariantCost(item.masterVariantId);
            orderCost += unitCost * item.quantity;
          }
        }
      }

      totalSales += orderAmount;
      totalCost += orderCost;

      if (orderDate >= monthStart) {
        monthSales += orderAmount;
        monthCost += orderCost;
        monthOrders++;
      }

      if (orderDate >= todayStart) {
        todaySales += orderAmount;
        todayCost += orderCost;
        todayOrders++;
      }
    }

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
        catalogProducts: catalogCount?.count ?? 0,
        pushedProducts: pushedCount?.count ?? 0,
        discountRate,
        totalOrders: totalOrdersResult?.count ?? 0,
        pendingOrders: pendingOrdersResult?.count ?? 0,
        sales: {
          today: { revenue: round2(todaySales), cost: round2(todayCost), profit: round2(todaySales - todayCost), orders: todayOrders },
          month: { revenue: round2(monthSales), cost: round2(monthCost), profit: round2(monthSales - monthCost), orders: monthOrders },
          total: { revenue: round2(totalSales), cost: round2(totalCost), profit: round2(totalSales - totalCost) },
        },
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

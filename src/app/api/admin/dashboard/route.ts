import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  masterProducts,
  masterVariants,
  tenants,
  orders,
} from "@/lib/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    // Run all queries in parallel for performance
    const [
      productCountResult,
      variantStatsResult,
      activeTenantResult,
      pendingTenantResult,
      totalOrderResult,
      pendingOrderResult,
      recentOrders,
    ] = await Promise.all([
      // Active master products count
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(masterProducts)
        .where(eq(masterProducts.status, "active")),

      // Total variants + total stock
      db
        .select({
          count: sql<number>`count(*)::int`,
          totalStock: sql<number>`coalesce(sum(${masterVariants.stockQuantity}), 0)::int`,
        })
        .from(masterVariants)
        .innerJoin(
          masterProducts,
          and(
            eq(masterVariants.masterProductId, masterProducts.id),
            eq(masterProducts.status, "active")
          )
        ),

      // Active tenants (approved + active, non-admin)
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(tenants)
        .where(
          and(
            eq(tenants.isApproved, true),
            eq(tenants.isActive, true),
            eq(tenants.isAdmin, false)
          )
        ),

      // Pending tenants (not approved, non-admin)
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(tenants)
        .where(
          and(
            eq(tenants.isApproved, false),
            eq(tenants.isAdmin, false)
          )
        ),

      // Total orders
      db.select({ count: sql<number>`count(*)::int` }).from(orders),

      // Pending orders (status = new)
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.status, "new")),

      // Recent 5 orders with tenant name
      db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          tenantName: tenants.name,
          tenantCompany: tenants.company,
          customerName: orders.customerName,
          totalAmount: orders.totalAmount,
          currency: orders.currency,
          status: orders.status,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(tenants, eq(orders.tenantId, tenants.id))
        .orderBy(desc(orders.createdAt))
        .limit(5),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        totalProducts: productCountResult[0]?.count ?? 0,
        totalVariants: variantStatsResult[0]?.count ?? 0,
        totalStock: variantStatsResult[0]?.totalStock ?? 0,
        activeTenants: activeTenantResult[0]?.count ?? 0,
        pendingTenants: pendingTenantResult[0]?.count ?? 0,
        totalOrders: totalOrderResult[0]?.count ?? 0,
        pendingOrders: pendingOrderResult[0]?.count ?? 0,
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
    console.error("[ADMIN/DASHBOARD] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

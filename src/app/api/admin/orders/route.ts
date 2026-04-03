import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders, tenants } from "@/lib/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim() || "";
    const tenantId = searchParams.get("tenantId")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status) {
      conditions.push(eq(orders.status, status));
    }
    if (tenantId) {
      const tid = parseInt(tenantId);
      if (!isNaN(tid)) {
        conditions.push(eq(orders.tenantId, tid));
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .where(where);

    const total = countResult?.total ?? 0;

    // Fetch orders with tenant info
    const orderList = await db
      .select({
        id: orders.id,
        tenantId: orders.tenantId,
        tenantName: tenants.name,
        tenantCompany: tenants.company,
        orderNumber: orders.orderNumber,
        externalOrderId: orders.externalOrderId,
        customerName: orders.customerName,
        customerEmail: orders.customerEmail,
        customerPhone: orders.customerPhone,
        shippingAddress: orders.shippingAddress,
        items: orders.items,
        totalAmount: orders.totalAmount,
        currency: orders.currency,
        status: orders.status,
        cargoCompany: orders.cargoCompany,
        cargoTrackingNumber: orders.cargoTrackingNumber,
        cargoTrackingUrl: orders.cargoTrackingUrl,
        notes: orders.notes,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .leftJoin(tenants, eq(orders.tenantId, tenants.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      success: true,
      data: orderList,
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
    console.error("[ADMIN/ORDERS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

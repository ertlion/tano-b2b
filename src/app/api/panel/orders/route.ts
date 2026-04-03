import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders } from "@/lib/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const conditions = [eq(orders.tenantId, tenantId)];
    if (status) {
      conditions.push(eq(orders.status, status));
    }

    const where = and(...conditions);

    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .where(where);

    const total = countResult?.total ?? 0;

    const orderList = await db.query.orders.findMany({
      where,
      orderBy: [desc(orders.createdAt)],
      limit,
      offset,
      columns: {
        id: true,
        orderNumber: true,
        externalOrderId: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        shippingAddress: true,
        items: true,
        totalAmount: true,
        currency: true,
        status: true,
        cargoCompany: true,
        cargoTrackingNumber: true,
        cargoTrackingUrl: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

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
    console.error("[PANEL/ORDERS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

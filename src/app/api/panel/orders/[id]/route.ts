import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = await requireAuth(request);
    const { id } = await params;
    const orderId = parseInt(id);

    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Gecersiz siparis ID" }, { status: 400 });
    }

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)),
      with: {
        orderStatusHistory: {
          orderBy: (h, { desc }) => [desc(h.createdAt)],
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Siparis bulunamadi" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/ORDERS/:id] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

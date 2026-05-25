import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { defectReports, orders } from "@/lib/schema";
import { eq, and, desc } from "drizzle-orm";
import { isWithinBusinessDays } from "@/lib/business-days";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const rows = await db
      .select({
        id: defectReports.id,
        orderId: defectReports.orderId,
        images: defectReports.images,
        description: defectReports.description,
        status: defectReports.status,
        adminNote: defectReports.adminNote,
        createdAt: defectReports.createdAt,
        orderNumber: orders.orderNumber,
      })
      .from(defectReports)
      .leftJoin(orders, eq(defectReports.orderId, orders.id))
      .where(eq(defectReports.tenantId, tenantId))
      .orderBy(desc(defectReports.createdAt));
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[PANEL/DEFECTS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const body = await request.json();
    const orderId = Number(body.orderId);
    const images: string[] = Array.isArray(body.images) ? body.images.filter((s: unknown) => typeof s === "string") : [];
    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (!orderId) return NextResponse.json({ error: "Sipariş seçilmeli" }, { status: 400 });
    if (images.length === 0) return NextResponse.json({ error: "En az bir ürün görseli yükleyin" }, { status: 400 });
    if (!description) return NextResponse.json({ error: "Açıklama gerekli" }, { status: 400 });

    // Sipariş üyeye ait mi + 5 iş günü kuralı
    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)),
      columns: { id: true, createdAt: true },
    });
    if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

    if (!isWithinBusinessDays(new Date(order.createdAt), 5)) {
      return NextResponse.json(
        { error: "Bu sipariş için 5 iş günü geçtiğinden defolu bildirim yapılamaz." },
        { status: 422 }
      );
    }

    const [created] = await db
      .insert(defectReports)
      .values({ tenantId, orderId, images, description, status: "pending" })
      .returning({ id: defectReports.id });

    return NextResponse.json({ success: true, data: { id: created.id } });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[PANEL/DEFECTS] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { defectReports, orders, tenants } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
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
        tenantName: tenants.name,
        tenantCompany: tenants.company,
      })
      .from(defectReports)
      .leftJoin(orders, eq(defectReports.orderId, orders.id))
      .leftJoin(tenants, eq(defectReports.tenantId, tenants.id))
      .orderBy(desc(defectReports.createdAt));
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[ADMIN/DEFECTS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { defectReports } from "@/lib/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const reportId = parseInt(id);
    if (isNaN(reportId)) return NextResponse.json({ error: "Geçersiz ID" }, { status: 400 });

    const body = await request.json();
    const status = body.status;
    if (!["approved", "rejected", "pending"].includes(status)) {
      return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
    }

    const report = await db.query.defectReports.findFirst({
      where: eq(defectReports.id, reportId),
      columns: { id: true, tenantId: true },
    });
    if (!report) return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });

    await db
      .update(defectReports)
      .set({ status, adminNote: body.adminNote ?? null, updatedAt: new Date() })
      .where(eq(defectReports.id, reportId));

    // Telegram bildirimi (Epic I) — yapılandırılmışsa üyeye haber ver.
    try {
      const { notifyTenant } = await import("@/lib/telegram");
      await notifyTenant(report.tenantId, "defect_result", {
        text: `Defolu ürün talebiniz ${status === "approved" ? "ONAYLANDI" : status === "rejected" ? "REDDEDİLDİ" : "güncellendi"}.${body.adminNote ? "\nNot: " + body.adminNote : ""}`,
      });
    } catch {
      // telegram opsiyonel
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[ADMIN/DEFECTS/:id] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

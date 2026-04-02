import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const tenantId = parseInt(id);

    if (isNaN(tenantId)) {
      return NextResponse.json({ error: "Gecersiz tenant ID" }, { status: 400 });
    }

    const existing = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    if (!existing) {
      return NextResponse.json({ error: "Bayi bulunamadi" }, { status: 404 });
    }

    if (existing.isAdmin) {
      return NextResponse.json(
        { error: "Admin hesabi reddedilemez" },
        { status: 403 }
      );
    }

    const [updated] = await db
      .update(tenants)
      .set({ isActive: false, isApproved: false, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning({
        id: tenants.id,
        name: tenants.name,
        email: tenants.email,
        company: tenants.company,
        isApproved: tenants.isApproved,
        isActive: tenants.isActive,
      });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/TENANTS/:id/reject] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

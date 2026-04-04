import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { returns } from "@/lib/schema";
import { eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const returnId = parseInt(id);

    if (isNaN(returnId)) {
      return NextResponse.json({ error: "Gecersiz iade ID" }, { status: 400 });
    }

    const body = await request.json();
    const { status, adminNote } = body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Status 'approved' veya 'rejected' olmalidir" },
        { status: 400 }
      );
    }

    const existing = await db.query.returns.findFirst({
      where: eq(returns.id, returnId),
    });

    if (!existing) {
      return NextResponse.json({ error: "Iade bulunamadi" }, { status: 404 });
    }

    const [updated] = await db
      .update(returns)
      .set({
        status,
        adminNote: adminNote || null,
        updatedAt: new Date(),
      })
      .where(eq(returns.id, returnId))
      .returning();

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/RETURNS/:id] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

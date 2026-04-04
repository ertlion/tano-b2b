import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoices, payments, tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const invoiceId = parseInt(id);
    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: "Gecersiz ID" }, { status: 400 });
    }

    const invoice = await db
      .select({
        id: invoices.id,
        tenantId: invoices.tenantId,
        tenantName: tenants.name,
        tenantCompany: tenants.company,
        invoiceNumber: invoices.invoiceNumber,
        periodStart: invoices.periodStart,
        periodEnd: invoices.periodEnd,
        totalAmount: invoices.totalAmount,
        paidAmount: invoices.paidAmount,
        currency: invoices.currency,
        status: invoices.status,
        notes: invoices.notes,
        fileUrl: invoices.fileUrl,
        dueDate: invoices.dueDate,
        parasutInvoiceId: invoices.parasutInvoiceId,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
      })
      .from(invoices)
      .leftJoin(tenants, eq(invoices.tenantId, tenants.id))
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (invoice.length === 0) {
      return NextResponse.json({ error: "Fatura bulunamadi" }, { status: 404 });
    }

    const invoicePayments = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId))
      .orderBy(payments.createdAt);

    return NextResponse.json({
      success: true,
      data: { ...invoice[0], payments: invoicePayments },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/INVOICES/ID] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const invoiceId = parseInt(id);
    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: "Gecersiz ID" }, { status: 400 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.fileUrl !== undefined) updateData.fileUrl = body.fileUrl;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;

    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(invoices)
      .set(updateData)
      .where(eq(invoices.id, invoiceId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Fatura bulunamadi" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/INVOICES/ID] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const invoiceId = parseInt(id);
    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: "Gecersiz ID" }, { status: 400 });
    }

    // Check if invoice exists and is unpaid
    const existing = await db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
      columns: { id: true, status: true, paidAmount: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Fatura bulunamadi" }, { status: 404 });
    }

    if (existing.status !== "unpaid" || Number(existing.paidAmount) > 0) {
      return NextResponse.json(
        { error: "Sadece odenmemis faturalar silinebilir" },
        { status: 400 }
      );
    }

    // Delete associated payments first (should be none for unpaid)
    await db.delete(payments).where(eq(payments.invoiceId, invoiceId));
    await db.delete(invoices).where(eq(invoices.id, invoiceId));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/INVOICES/ID] DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

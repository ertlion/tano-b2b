import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoices, tenants } from "@/lib/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim() || "";
    const tenantId = searchParams.get("tenantId")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status) {
      conditions.push(eq(invoices.status, status));
    }
    if (tenantId) {
      const tid = parseInt(tenantId);
      if (!isNaN(tid)) {
        conditions.push(eq(invoices.tenantId, tid));
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(invoices)
      .where(where);

    const total = countResult?.total ?? 0;

    const invoiceList = await db
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
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      success: true,
      data: invoiceList,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/INVOICES] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const { tenantId, invoiceNumber, periodStart, periodEnd, totalAmount, dueDate, notes, fileUrl } = body;

    if (!tenantId || !invoiceNumber || !periodStart || !periodEnd || !totalAmount) {
      return NextResponse.json(
        { error: "tenantId, invoiceNumber, periodStart, periodEnd, totalAmount alanlari zorunlu" },
        { status: 400 }
      );
    }

    const amount = parseFloat(totalAmount);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "Gecerli bir tutar girin" }, { status: 400 });
    }

    // Verify tenant exists
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, parseInt(tenantId)),
      columns: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Musteri bulunamadi" }, { status: 404 });
    }

    const [newInvoice] = await db
      .insert(invoices)
      .values({
        tenantId: parseInt(tenantId),
        invoiceNumber: String(invoiceNumber).trim(),
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        totalAmount: String(amount),
        paidAmount: "0",
        currency: "TRY",
        status: "unpaid",
        notes: notes?.trim() || null,
        fileUrl: fileUrl || null,
        dueDate: dueDate ? new Date(dueDate) : null,
      })
      .returning();

    return NextResponse.json({ success: true, data: newInvoice }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/INVOICES] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

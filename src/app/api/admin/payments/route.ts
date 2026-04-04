import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { payments, invoices, tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const { tenantId, invoiceId, amount, type, method, reference, notes } = body;

    if (!tenantId || !amount || !type) {
      return NextResponse.json(
        { error: "tenantId, amount, type alanlari zorunlu" },
        { status: 400 }
      );
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Gecerli bir tutar girin" }, { status: 400 });
    }

    if (!["payment", "refund"].includes(type)) {
      return NextResponse.json({ error: "type: payment veya refund olmali" }, { status: 400 });
    }

    // Verify tenant exists
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, parseInt(tenantId)),
      columns: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Musteri bulunamadi" }, { status: 404 });
    }

    // If invoiceId provided, verify invoice exists and belongs to tenant
    if (invoiceId) {
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, parseInt(invoiceId)),
        columns: { id: true, tenantId: true, totalAmount: true, paidAmount: true },
      });
      if (!invoice) {
        return NextResponse.json({ error: "Fatura bulunamadi" }, { status: 404 });
      }
      if (invoice.tenantId !== parseInt(tenantId)) {
        return NextResponse.json({ error: "Fatura bu musteriye ait degil" }, { status: 400 });
      }
    }

    // Create payment
    const [newPayment] = await db
      .insert(payments)
      .values({
        tenantId: parseInt(tenantId),
        invoiceId: invoiceId ? parseInt(invoiceId) : null,
        amount: String(parsedAmount),
        type,
        method: method || null,
        reference: reference?.trim() || null,
        notes: notes?.trim() || null,
      })
      .returning();

    // Update invoice paidAmount and status if linked to an invoice
    if (invoiceId) {
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, parseInt(invoiceId)),
        columns: { id: true, totalAmount: true, paidAmount: true },
      });

      if (invoice) {
        const currentPaid = Number(invoice.paidAmount);
        const total = Number(invoice.totalAmount);
        const effectiveAmount = type === "refund" ? -parsedAmount : parsedAmount;
        const newPaid = Math.max(0, currentPaid + effectiveAmount);

        let newStatus = "unpaid";
        if (newPaid >= total) {
          newStatus = "paid";
        } else if (newPaid > 0) {
          newStatus = "partial";
        }

        await db
          .update(invoices)
          .set({
            paidAmount: String(newPaid),
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, parseInt(invoiceId)));
      }
    }

    return NextResponse.json({ success: true, data: newPayment }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/PAYMENTS] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

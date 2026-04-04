import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoices, payments } from "@/lib/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const invoiceList = await db
      .select()
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId))
      .orderBy(desc(invoices.createdAt));

    // Fetch payments for each invoice
    const result = await Promise.all(
      invoiceList.map(async (inv) => {
        const invoicePayments = await db
          .select()
          .from(payments)
          .where(and(eq(payments.invoiceId, inv.id), eq(payments.tenantId, tenantId)))
          .orderBy(desc(payments.createdAt));
        return { ...inv, payments: invoicePayments };
      })
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[PANEL/INVOICES] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

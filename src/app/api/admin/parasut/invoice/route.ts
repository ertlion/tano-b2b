import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoices, orders, tenants } from "@/lib/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  findOrCreateContact,
  createSalesInvoice,
  type ParasutConfig,
} from "@/lib/parasut";
import { loadParasutConfig } from "@/lib/parasut-config";

interface OrderItem {
  title?: string;
  productName?: string;
  sku?: string;
  quantity?: number;
  unitPrice?: number;
  size?: string;
  color?: string;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const { tenantId, periodStart, periodEnd, invoiceId: localInvoiceId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId zorunlu" }, { status: 400 });
    }

    const config = await loadParasutConfig();
    if (!config) {
      return NextResponse.json(
        { error: "Parasut ayarlari eksik. Once ayarlari kaydedin." },
        { status: 400 }
      );
    }

    // If a local invoice ID is provided, send that specific invoice
    if (localInvoiceId) {
      return await sendExistingInvoice(config, parseInt(localInvoiceId));
    }

    // Otherwise create a new invoice from tenant orders in period
    if (!periodStart || !periodEnd) {
      return NextResponse.json(
        { error: "periodStart ve periodEnd zorunlu" },
        { status: 400 }
      );
    }

    const tid = parseInt(tenantId);
    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);

    // Fetch tenant
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tid),
      columns: { id: true, name: true, company: true, email: true, phone: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Musteri bulunamadi" }, { status: 404 });
    }

    // Find or create contact on Parasut
    const contactId = await findOrCreateContact(config, {
      name: tenant.company,
      email: tenant.email,
      phone: tenant.phone,
    });

    // Fetch orders in period
    const periodOrders = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        items: orders.items,
        totalAmount: orders.totalAmount,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tid),
          gte(orders.createdAt, startDate),
          lte(orders.createdAt, endDate)
        )
      );

    if (periodOrders.length === 0) {
      return NextResponse.json(
        { error: "Bu donemde siparis bulunamadi" },
        { status: 404 }
      );
    }

    // Build line items from all orders
    const lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
    }> = [];

    for (const order of periodOrders) {
      const items = (order.items || []) as OrderItem[];
      if (Array.isArray(items)) {
        for (const item of items) {
          const name = item.title || item.productName || "Urun";
          const desc = [name, item.color, item.size, item.sku]
            .filter(Boolean)
            .join(" - ");
          lineItems.push({
            description: `${order.orderNumber}: ${desc}`,
            quantity: Number(item.quantity) || 1,
            unitPrice: Number(item.unitPrice) || 0,
            vatRate: 20,
          });
        }
      }
    }

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: "Fatura kalemleri olusturulamadi" },
        { status: 400 }
      );
    }

    const issueDate = new Date().toISOString().split("T")[0];
    const formattedStart = startDate.toLocaleDateString("tr-TR");
    const formattedEnd = endDate.toLocaleDateString("tr-TR");
    const description = `${tenant.company} - ${formattedStart} / ${formattedEnd} donemi siparisleri`;

    // Create sales invoice on Parasut
    const parasutResult = await createSalesInvoice(config, {
      contactId,
      issueDate,
      description,
      items: lineItems,
    });

    // Calculate total
    const total = lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );

    // Create local invoice record
    const invoiceNumber = `PST-${parasutResult.invoiceNumber || parasutResult.invoiceId}`;

    const [newInvoice] = await db
      .insert(invoices)
      .values({
        tenantId: tid,
        invoiceNumber,
        periodStart: startDate,
        periodEnd: endDate,
        totalAmount: String(total),
        paidAmount: "0",
        currency: "TRY",
        status: "unpaid",
        notes: description,
        parasutInvoiceId: parasutResult.invoiceId,
      })
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        parasutInvoiceId: parasutResult.invoiceId,
        parasutInvoiceNumber: parasutResult.invoiceNumber,
        localInvoiceId: newInvoice.id,
        totalAmount: total,
        itemCount: lineItems.length,
        orderCount: periodOrders.length,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Sunucu hatasi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Send an existing local invoice to Parasut
async function sendExistingInvoice(config: ParasutConfig, invoiceId: number) {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });

  if (!invoice) {
    return NextResponse.json({ error: "Fatura bulunamadi" }, { status: 404 });
  }

  if (invoice.parasutInvoiceId) {
    return NextResponse.json(
      { error: "Bu fatura zaten Parasut'e gonderilmis" },
      { status: 400 }
    );
  }

  // Get tenant
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, invoice.tenantId),
    columns: { id: true, name: true, company: true, email: true, phone: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Musteri bulunamadi" }, { status: 404 });
  }

  // Find or create contact
  const contactId = await findOrCreateContact(config, {
    name: tenant.company,
    email: tenant.email,
    phone: tenant.phone,
  });

  const issueDate = new Date().toISOString().split("T")[0];
  const description = invoice.notes || `${tenant.company} - Fatura ${invoice.invoiceNumber}`;
  const totalAmount = Number(invoice.totalAmount);

  // Create a single line item for the total
  const parasutResult = await createSalesInvoice(config, {
    contactId,
    issueDate,
    description,
    items: [
      {
        description: `Fatura: ${invoice.invoiceNumber}`,
        quantity: 1,
        unitPrice: totalAmount,
        vatRate: 20,
      },
    ],
  });

  // Update local invoice with Parasut ID
  await db
    .update(invoices)
    .set({
      parasutInvoiceId: parasutResult.invoiceId,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));

  return NextResponse.json({
    success: true,
    data: {
      parasutInvoiceId: parasutResult.invoiceId,
      parasutInvoiceNumber: parasutResult.invoiceNumber,
      localInvoiceId: invoiceId,
    },
  });
}

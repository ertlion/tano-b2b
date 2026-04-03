import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants, tenantProducts, orders } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const tenantId = parseInt(id);

    if (isNaN(tenantId)) {
      return NextResponse.json({ error: "Geçersiz tenant ID" }, { status: 400 });
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: {
        id: true,
        name: true,
        email: true,
        company: true,
        phone: true,
        marketplace: true,
        isAdmin: true,
        isApproved: true,
        isActive: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Bayi bulunamadi" }, { status: 404 });
    }

    // Get counts
    const [productCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantProducts)
      .where(eq(tenantProducts.tenantId, tenantId));

    const [orderCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.tenantId, tenantId));

    return NextResponse.json({
      success: true,
      data: {
        ...tenant,
        tenantProductsCount: productCount?.count ?? 0,
        ordersCount: orderCount?.count ?? 0,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/TENANTS/:id] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const tenantId = parseInt(id);

    if (isNaN(tenantId)) {
      return NextResponse.json({ error: "Geçersiz tenant ID" }, { status: 400 });
    }

    const existing = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    if (!existing) {
      return NextResponse.json({ error: "Bayi bulunamadi" }, { status: 404 });
    }

    const body = await request.json();

    const allowedFields = [
      "name",
      "company",
      "phone",
      "marketplace",
      "isApproved",
      "isActive",
      "notes",
    ] as const;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const [updated] = await db
      .update(tenants)
      .set(updateData)
      .where(eq(tenants.id, tenantId))
      .returning({
        id: tenants.id,
        name: tenants.name,
        email: tenants.email,
        company: tenants.company,
        phone: tenants.phone,
        marketplace: tenants.marketplace,
        isApproved: tenants.isApproved,
        isActive: tenants.isActive,
        notes: tenants.notes,
        updatedAt: tenants.updatedAt,
      });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/TENANTS/:id] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const tenantId = parseInt(id);

    if (isNaN(tenantId)) {
      return NextResponse.json({ error: "Geçersiz tenant ID" }, { status: 400 });
    }

    const existing = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    if (!existing) {
      return NextResponse.json({ error: "Bayi bulunamadi" }, { status: 404 });
    }

    if (existing.isAdmin) {
      return NextResponse.json(
        { error: "Admin hesabı devre dışı bırakılamaz" },
        { status: 403 }
      );
    }

    const [updated] = await db
      .update(tenants)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning({
        id: tenants.id,
        name: tenants.name,
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
    console.error("[ADMIN/TENANTS/:id] DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

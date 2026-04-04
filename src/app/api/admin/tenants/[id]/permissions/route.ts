import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  masterProducts,
  tenantProductPermissions,
} from "@/lib/schema";
import { eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const tenantId = parseInt(id);

    if (isNaN(tenantId)) {
      return NextResponse.json({ error: "Gecersiz tenant ID" }, { status: 400 });
    }

    // Get all permission records for this tenant
    const permissions = await db.query.tenantProductPermissions.findMany({
      where: eq(tenantProductPermissions.tenantId, tenantId),
    });

    const permMap = new Map(
      permissions.map((p) => [p.masterProductId, p.allowed])
    );

    const hasRecords = permissions.length > 0;
    const mode = hasRecords ? "restricted" : "all";

    // Get all active products
    const products = await db.query.masterProducts.findMany({
      where: eq(masterProducts.status, "active"),
      columns: {
        id: true,
        name: true,
        sku: true,
        category: true,
        images: true,
      },
      orderBy: (p, { asc }) => [asc(p.name)],
    });

    const data = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      image: p.images?.[0] ?? null,
      allowed: hasRecords ? (permMap.get(p.id) ?? false) : true,
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: {
        mode,
        totalProducts: products.length,
        allowedCount: hasRecords
          ? permissions.filter((p) => p.allowed).length
          : products.length,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/TENANTS/:id/PERMISSIONS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const tenantId = parseInt(id);

    if (isNaN(tenantId)) {
      return NextResponse.json({ error: "Gecersiz tenant ID" }, { status: 400 });
    }

    const body = await request.json();
    const { productIds, allowed } = body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: "productIds dizisi gerekli" },
        { status: 400 }
      );
    }

    if (typeof allowed !== "boolean") {
      return NextResponse.json(
        { error: "allowed alani boolean olmali" },
        { status: 400 }
      );
    }

    // Upsert each permission
    for (const productId of productIds) {
      const pid = parseInt(productId);
      if (isNaN(pid)) continue;

      await db
        .insert(tenantProductPermissions)
        .values({
          tenantId,
          masterProductId: pid,
          allowed,
        })
        .onConflictDoUpdate({
          target: [
            tenantProductPermissions.tenantId,
            tenantProductPermissions.masterProductId,
          ],
          set: { allowed },
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/TENANTS/:id/PERMISSIONS] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const tenantId = parseInt(id);

    if (isNaN(tenantId)) {
      return NextResponse.json({ error: "Gecersiz tenant ID" }, { status: 400 });
    }

    await db
      .delete(tenantProductPermissions)
      .where(eq(tenantProductPermissions.tenantId, tenantId));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/TENANTS/:id/PERMISSIONS] DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

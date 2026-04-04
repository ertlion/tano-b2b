import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants, tenantProducts, syncLogs, stockMovements } from "@/lib/schema";
import { eq, desc, sql, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");

    // 1. Per-tenant sync summary
    const tenantList = await db.query.tenants.findMany({
      where: and(eq(tenants.isActive, true), eq(tenants.isAdmin, false)),
      columns: { id: true, name: true, company: true, marketplace: true },
    });

    const tenantSummaries = await Promise.all(
      tenantList.map(async (t) => {
        const [productCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tenantProducts)
          .where(eq(tenantProducts.tenantId, t.id));

        const [activeCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tenantProducts)
          .where(and(eq(tenantProducts.tenantId, t.id), eq(tenantProducts.status, "active")));

        const lastSync = await db.query.tenantProducts.findFirst({
          where: eq(tenantProducts.tenantId, t.id),
          orderBy: [desc(tenantProducts.syncedAt)],
          columns: { syncedAt: true },
        });

        return {
          id: t.id,
          name: t.name,
          company: t.company,
          marketplace: t.marketplace,
          totalProducts: productCount?.count ?? 0,
          activeProducts: activeCount?.count ?? 0,
          lastSyncAt: lastSync?.syncedAt ?? null,
        };
      })
    );

    // 2. Recent pushed products (all tenants or filtered)
    const pushCondition = tenantId
      ? eq(tenantProducts.tenantId, parseInt(tenantId))
      : undefined;

    const recentPushes = await db.query.tenantProducts.findMany({
      where: pushCondition,
      with: {
        tenant: { columns: { name: true, company: true } },
        masterProduct: { columns: { name: true, sku: true } },
      },
      orderBy: [desc(tenantProducts.syncedAt)],
      limit: 50,
    });

    // 3. Recent stock movements (shows who caused stock change)
    const recentMovements = await db.query.stockMovements.findMany({
      with: {
        masterVariant: {
          with: {
            masterProduct: { columns: { name: true, sku: true } },
          },
          columns: { size: true, color: true, barcode: true },
        },
      },
      orderBy: [desc(stockMovements.createdAt)],
      limit: 50,
    });

    // 4. Recent sync logs
    const recentLogs = await db.query.syncLogs.findMany({
      with: {
        tenant: { columns: { name: true, company: true } },
      },
      orderBy: [desc(syncLogs.createdAt)],
      limit: 30,
    });

    return NextResponse.json({
      success: true,
      data: {
        tenants: tenantSummaries,
        recentPushes: recentPushes.map((p) => ({
          id: p.id,
          tenantName: p.tenant?.company || p.tenant?.name || "?",
          productName: p.masterProduct?.name || "?",
          productSku: p.masterProduct?.sku || "?",
          externalProductId: p.externalProductId,
          status: p.status,
          syncedAt: p.syncedAt,
          createdAt: p.createdAt,
        })),
        recentMovements: recentMovements.map((m) => ({
          id: m.id,
          productName: m.masterVariant?.masterProduct?.name || "?",
          productSku: m.masterVariant?.masterProduct?.sku || "?",
          color: m.masterVariant?.color || null,
          size: m.masterVariant?.size || "?",
          barcode: m.masterVariant?.barcode || "?",
          type: m.type,
          quantity: m.quantity,
          previousStock: m.previousStock,
          newStock: m.newStock,
          reference: m.reference,
          createdAt: m.createdAt,
        })),
        recentLogs: recentLogs.map((l) => ({
          id: l.id,
          tenantName: l.tenant?.company || l.tenant?.name || "Sistem",
          type: l.type,
          status: l.status,
          details: l.details,
          createdAt: l.createdAt,
        })),
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/SYNC] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

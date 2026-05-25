import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { addBalance, getBalances, getTransactions, type BalanceType } from "@/lib/balance";

export const dynamic = "force-dynamic";

// GET ?tenantId= → o üyenin bakiyeleri + son hareketler + ayarları
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const tenantId = Number(request.nextUrl.searchParams.get("tenantId"));
    if (!tenantId) return NextResponse.json({ error: "tenantId gerekli" }, { status: 400 });

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { id: true, name: true, imageUnitPrice: true, allowActionWithoutBalance: true },
    });
    if (!tenant) return NextResponse.json({ error: "Üye bulunamadı" }, { status: 404 });

    const balances = await getBalances(tenantId);
    const transactions = await getTransactions(tenantId, 30);
    return NextResponse.json({
      success: true,
      data: {
        balances,
        imageUnitPrice: Number(tenant.imageUnitPrice) || 0,
        allowActionWithoutBalance: tenant.allowActionWithoutBalance,
        transactions,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/BALANCES] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST → manuel bakiye ekle { tenantId, type, amount, note }
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const tenantId = Number(body.tenantId);
    const type = body.type as BalanceType;
    const amount = Number(body.amount);

    if (!tenantId) return NextResponse.json({ error: "tenantId gerekli" }, { status: 400 });
    if (type !== "product" && type !== "image") {
      return NextResponse.json({ error: "Geçersiz bakiye tipi" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: "Geçersiz tutar" }, { status: 400 });
    }

    const after = await addBalance(tenantId, type, Math.abs(amount), "admin_add", {
      note: body.note || "Admin manuel bakiye",
    });
    return NextResponse.json({ success: true, data: { balanceAfter: after } });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/BALANCES] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// PUT → üye bakiye ayarları { tenantId, imageUnitPrice?, allowActionWithoutBalance? }
export async function PUT(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const tenantId = Number(body.tenantId);
    if (!tenantId) return NextResponse.json({ error: "tenantId gerekli" }, { status: 400 });

    const set: Record<string, unknown> = {};
    if (body.imageUnitPrice !== undefined) {
      const p = Number(body.imageUnitPrice);
      if (!Number.isFinite(p) || p < 0) return NextResponse.json({ error: "Geçersiz fiyat" }, { status: 400 });
      set.imageUnitPrice = String(p);
    }
    if (body.allowActionWithoutBalance !== undefined) {
      set.allowActionWithoutBalance = Boolean(body.allowActionWithoutBalance);
    }
    if (Object.keys(set).length > 0) {
      await db.update(tenants).set(set).where(eq(tenants.id, tenantId));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/BALANCES] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

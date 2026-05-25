import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants, balanceTopups } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getPaytrToken, generateMerchantOid, paytrConfigured } from "@/lib/paytr";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    if (!(await paytrConfigured())) {
      return NextResponse.json({ error: "PayTR yapılandırılmamış" }, { status: 503 });
    }

    const body = await request.json();
    const type = body.type === "image" ? "image" : "product";
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 1) {
      return NextResponse.json({ error: "Geçersiz tutar (min 1 ₺)" }, { status: 400 });
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { email: true, name: true, company: true, phone: true },
    });
    if (!tenant) return NextResponse.json({ error: "Üye bulunamadı" }, { status: 404 });

    const merchantOid = generateMerchantOid(tenantId);
    const amountKurus = Math.round(amount * 100);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const userIp =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

    await db.insert(balanceTopups).values({
      tenantId,
      merchantOid,
      balanceType: type,
      amount: String(amount),
      status: "pending",
    });

    const result = await getPaytrToken({
      merchantOid,
      email: tenant.email,
      amountKurus,
      userIp,
      userName: tenant.name || tenant.company || "Üye",
      userAddress: tenant.company || "-",
      userPhone: tenant.phone || "0000000000",
      okUrl: `${appUrl}/panel/balance?topup=ok`,
      failUrl: `${appUrl}/panel/balance?topup=fail`,
      callbackUrl: `${appUrl}/api/webhooks/paytr`,
      basketLabel: type === "image" ? "AI Gorsel Bakiyesi" : "Urun Bakiyesi",
    });

    if (!result.ok) {
      await db
        .update(balanceTopups)
        .set({ status: "failed", failReason: result.error })
        .where(eq(balanceTopups.merchantOid, merchantOid));
      return NextResponse.json({ error: result.error || "Token alınamadı" }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      data: { token: result.token, iframeUrl: `https://www.paytr.com/odeme/guvenli/${result.token}` },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[PANEL/BALANCE/TOPUP] error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

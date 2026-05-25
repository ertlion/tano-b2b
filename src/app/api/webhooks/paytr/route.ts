import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { balanceTopups } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { verifyPaytrCallback } from "@/lib/paytr";
import { addBalance, type BalanceType } from "@/lib/balance";

export const dynamic = "force-dynamic";

// PayTR callback (merchant_notification_url). PayTR form-urlencoded POST gönderir
// ve düz "OK" yanıtı bekler. İdempotent (merchant_oid).
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const merchantOid = String(form.get("merchant_oid") || "");
    const status = String(form.get("status") || "");
    const totalAmount = String(form.get("total_amount") || "");
    const hash = String(form.get("hash") || "");
    const failedReason = String(form.get("failed_reason_msg") || "");

    if (!merchantOid || !verifyPaytrCallback(merchantOid, status, totalAmount, hash)) {
      console.error("[WEBHOOK/PAYTR] Hash doğrulanamadı:", merchantOid);
      return new NextResponse("PAYTR notification failed: bad hash", { status: 400 });
    }

    const topup = await db.query.balanceTopups.findFirst({
      where: eq(balanceTopups.merchantOid, merchantOid),
    });

    // Bilinmeyen oid olsa bile PayTR'a OK dön (tekrar denemesin).
    if (!topup) {
      console.error("[WEBHOOK/PAYTR] Bilinmeyen merchant_oid:", merchantOid);
      return new NextResponse("OK");
    }

    // Idempotency: zaten işlenmişse tekrar bakiye ekleme.
    if (topup.status !== "pending") {
      return new NextResponse("OK");
    }

    if (status === "success") {
      await addBalance(topup.tenantId, topup.balanceType as BalanceType, Number(topup.amount), "paytr_load", {
        reference: merchantOid,
        note: "PayTR ile bakiye yükleme",
      });
      await db
        .update(balanceTopups)
        .set({ status: "success", completedAt: new Date() })
        .where(eq(balanceTopups.merchantOid, merchantOid));
    } else {
      await db
        .update(balanceTopups)
        .set({ status: "failed", failReason: failedReason || "PayTR başarısız", completedAt: new Date() })
        .where(eq(balanceTopups.merchantOid, merchantOid));
    }

    return new NextResponse("OK");
  } catch (error) {
    console.error("[WEBHOOK/PAYTR] error:", error);
    // Hata olsa bile OK dönmemek PayTR'ın tekrar denemesini sağlar.
    return new NextResponse("error", { status: 500 });
  }
}

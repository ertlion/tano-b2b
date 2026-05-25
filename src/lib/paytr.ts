import crypto from "crypto";
import { getConfigValues } from "./app-config";

// ─── PayTR iFrame API (Epic F) ─────────────────────────────
// Bakiye yükleme: token al → iframe göster → callback ile doğrula → bakiye ekle.
// Config (admin panel / app_config → env): paytr_merchant_id/key/salt/test_mode

async function paytrCreds() {
  return getConfigValues([
    "paytr_merchant_id",
    "paytr_merchant_key",
    "paytr_merchant_salt",
    "paytr_test_mode",
  ]);
}

export async function paytrConfigured(): Promise<boolean> {
  const c = await paytrCreds();
  return Boolean(c.paytr_merchant_id && c.paytr_merchant_key && c.paytr_merchant_salt);
}

interface TokenParams {
  merchantOid: string;
  email: string;
  amountKurus: number; // TL × 100, tam sayı
  userIp: string;
  userName: string;
  userAddress: string;
  userPhone: string;
  okUrl: string;
  failUrl: string;
  callbackUrl: string;
  basketLabel: string;
}

/**
 * PayTR get-token çağrısı. Başarılıysa iframe token döner.
 */
export async function getPaytrToken(p: TokenParams): Promise<{ ok: boolean; token?: string; error?: string }> {
  const c = await paytrCreds();
  const merchant_id = c.paytr_merchant_id!;
  const merchant_key = c.paytr_merchant_key!;
  const merchant_salt = c.paytr_merchant_salt!;
  const test_mode = c.paytr_test_mode === "1" ? "1" : "0";
  const no_installment = "0";
  const max_installment = "0";
  const currency = "TL";

  const user_basket = Buffer.from(
    JSON.stringify([[p.basketLabel, (p.amountKurus / 100).toFixed(2), 1]])
  ).toString("base64");

  const payment_amount = String(p.amountKurus);

  const hashStr =
    merchant_id +
    p.userIp +
    p.merchantOid +
    p.email +
    payment_amount +
    user_basket +
    no_installment +
    max_installment +
    currency +
    test_mode;

  const paytr_token = crypto
    .createHmac("sha256", merchant_key)
    .update(hashStr + merchant_salt)
    .digest("base64");

  const form = new URLSearchParams({
    merchant_id,
    user_ip: p.userIp,
    merchant_oid: p.merchantOid,
    email: p.email,
    payment_amount,
    paytr_token,
    user_basket,
    debug_on: test_mode === "1" ? "1" : "0",
    no_installment,
    max_installment,
    user_name: p.userName,
    user_address: p.userAddress,
    user_phone: p.userPhone,
    merchant_ok_url: p.okUrl,
    merchant_fail_url: p.failUrl,
    merchant_notification_url: p.callbackUrl,
    timeout_limit: "30",
    currency,
    test_mode,
    lang: "tr",
  });

  try {
    const res = await fetch("https://www.paytr.com/odeme/api/get-token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const data = await res.json();
    if (data.status === "success") return { ok: true, token: data.token };
    return { ok: false, error: data.reason || "PayTR token alınamadı" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "PayTR bağlantı hatası" };
  }
}

/**
 * Callback hash doğrulama. PayTR şunu gönderir: merchant_oid, status, total_amount, hash.
 */
export async function verifyPaytrCallback(merchantOid: string, status: string, totalAmount: string, hash: string): Promise<boolean> {
  const c = await paytrCreds();
  const merchant_key = c.paytr_merchant_key;
  const merchant_salt = c.paytr_merchant_salt;
  if (!merchant_key || !merchant_salt) return false;
  const expected = crypto
    .createHmac("sha256", merchant_key)
    .update(merchantOid + merchant_salt + status + totalAmount)
    .digest("base64");
  // Sabit zamanlı karşılaştırma
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
  } catch {
    return false;
  }
}

export function generateMerchantOid(tenantId: number): string {
  // Sadece alfanumerik (PayTR kuralı).
  const rand = crypto.randomBytes(6).toString("hex");
  return `TT${tenantId}${Date.now()}${rand}`.replace(/[^a-zA-Z0-9]/g, "");
}

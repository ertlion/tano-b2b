import { db } from "./db";
import { tenants } from "./schema";
import { eq } from "drizzle-orm";
import { getConfigValue } from "./app-config";

// ─── Telegram Bildirimleri (Epic I) ────────────────────────
// Tek bot (token Entegrasyonlar'da: telegram_bot_token). Üye /start <kod> ile eşleşir
// → chat_id kaydedilir. Username'den doğrudan mesaj atılamaz, chat_id şart.

export type TelegramEvent = "order" | "defect_result" | "low_balance" | "image_ready" | "admin";

export async function telegramConfigured(): Promise<boolean> {
  return Boolean(await getConfigValue("telegram_bot_token"));
}

export async function sendMessage(chatId: string, text: string): Promise<boolean> {
  const token = await getConfigValue("telegram_bot_token");
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Üyeye bildirim gönder (chat_id eşliyse + olay tercihi açıksa).
 * 'admin' (manuel) olayı tercih kontrolüne tabi değildir.
 */
export async function notifyTenant(
  tenantId: number,
  event: TelegramEvent,
  payload: { text: string }
): Promise<boolean> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { telegramChatId: true, telegramPrefs: true },
  });
  if (!tenant?.telegramChatId) return false;

  if (event !== "admin") {
    const prefs = (tenant.telegramPrefs as Record<string, boolean> | null) || {};
    // Tercih açıkça false ise gönderme; tanımsızsa varsayılan açık.
    if (prefs[event] === false) return false;
  }
  return sendMessage(tenant.telegramChatId, payload.text);
}

/**
 * /start <kod> eşleme kodu üret/çöz. Kod = base64url(tenantId).
 */
export function makePairingCode(tenantId: number): string {
  return Buffer.from(`t:${tenantId}`).toString("base64url");
}

export function parsePairingCode(code: string): number | null {
  try {
    const s = Buffer.from(code, "base64url").toString("utf8");
    const m = s.match(/^t:(\d+)$/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

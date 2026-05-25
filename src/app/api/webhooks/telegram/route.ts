import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parsePairingCode, sendMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// Telegram bot webhook. /start <kod> → üye chat_id eşleme.
export async function POST(request: NextRequest) {
  try {
    const update = await request.json();
    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const text: string = msg?.text || "";

    if (!chatId) return NextResponse.json({ ok: true });

    if (text.startsWith("/start")) {
      const code = text.split(/\s+/)[1] || "";
      const tenantId = code ? parsePairingCode(code) : null;
      if (tenantId) {
        await db
          .update(tenants)
          .set({ telegramChatId: String(chatId) })
          .where(eq(tenants.id, tenantId));
        await sendMessage(String(chatId), "✅ Telegram bildirimleriniz aktif edildi. Tano Toptan");
      } else {
        await sendMessage(
          String(chatId),
          "Eşleme kodu eksik. Panelden Ayarlar → Telegram bağlantısını kullanın."
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[WEBHOOK/TELEGRAM] error:", error);
    return NextResponse.json({ ok: true });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { makePairingCode } from "@/lib/telegram";
import { getConfigValue } from "@/lib/app-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { telegramUsername: true, telegramChatId: true, telegramPrefs: true },
    });
    const botUsername = await getConfigValue("telegram_bot_username");
    const code = makePairingCode(tenantId);
    return NextResponse.json({
      success: true,
      data: {
        username: tenant?.telegramUsername || "",
        connected: Boolean(tenant?.telegramChatId),
        prefs: tenant?.telegramPrefs || { order: true, defect_result: true, low_balance: true, image_ready: true },
        botUsername: botUsername || "",
        pairingLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : "",
      },
    });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[PANEL/TELEGRAM] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const body = await request.json();
    const set: Record<string, unknown> = {};
    if (typeof body.username === "string") set.telegramUsername = body.username.replace(/^@/, "").trim() || null;
    if (body.prefs && typeof body.prefs === "object") set.telegramPrefs = body.prefs;
    if (Object.keys(set).length > 0) {
      await db.update(tenants).set(set).where(eq(tenants.id, tenantId));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[PANEL/TELEGRAM] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

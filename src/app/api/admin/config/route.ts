import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { appConfig } from "@/lib/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Global ayarlar (app_config). Şu an: usd_try_rate.
const EDITABLE_KEYS = ["usd_try_rate"];

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const rows = await db.query.appConfig.findMany();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value ?? "";
    return NextResponse.json({ success: true, data: map });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/CONFIG] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();

    if (body.usd_try_rate !== undefined) {
      const rate = Number(body.usd_try_rate);
      if (!Number.isFinite(rate) || rate <= 0) {
        return NextResponse.json({ error: "Geçersiz kur (pozitif sayı olmalı)" }, { status: 400 });
      }
    }

    for (const key of EDITABLE_KEYS) {
      if (body[key] === undefined) continue;
      const value = String(body[key]);
      await db
        .insert(appConfig)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: new Date() } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/CONFIG] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

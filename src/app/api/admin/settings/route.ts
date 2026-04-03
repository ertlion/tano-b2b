import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const adminTenantId = await requireAdmin(request);

    const allSettings = await db.query.settings.findMany({
      where: eq(settings.tenantId, adminTenantId),
    });

    // Convert to key-value map
    const settingsMap: Record<string, string> = {};
    for (const s of allSettings) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json({ success: true, data: settingsMap });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/SETTINGS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminTenantId = await requireAdmin(request);

    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Body key-value object olmali" },
        { status: 400 }
      );
    }

    // Sensitive keys that should not be stored through this endpoint
    const blockedKeys = ["password", "secret", "token"];

    const entries = Object.entries(body) as [string, unknown][];
    const savedKeys: string[] = [];

    for (const [key, value] of entries) {
      if (!key || typeof key !== "string") continue;

      const lowerKey = key.toLowerCase();
      if (blockedKeys.some((bk) => lowerKey.includes(bk))) {
        continue; // Skip sensitive keys silently
      }

      const stringValue = typeof value === "string" ? value : JSON.stringify(value);

      // Upsert: insert or update on conflict
      await db
        .insert(settings)
        .values({
          tenantId: adminTenantId,
          key: key.trim(),
          value: stringValue,
        })
        .onConflictDoUpdate({
          target: [settings.tenantId, settings.key],
          set: { value: stringValue },
        });

      savedKeys.push(key);
    }

    return NextResponse.json({
      success: true,
      data: { savedKeys },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/SETTINGS] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

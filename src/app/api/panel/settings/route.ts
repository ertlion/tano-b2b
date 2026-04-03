import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getTenantSettings, setTenantSetting } from "@/lib/tenant-settings";
import { MARKETPLACE_SETTINGS } from "@/lib/marketplace/settings-map";
import type { MarketplaceName } from "@/lib/marketplace/types";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { id: true, marketplace: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Bayi bulunamadi" }, { status: 404 });
    }

    const marketplace = tenant.marketplace as MarketplaceName;
    const config = MARKETPLACE_SETTINGS[marketplace];
    const allSettings = await getTenantSettings(tenantId);

    // Only return settings relevant to their marketplace
    // Mask password fields
    const settingsData: Record<string, string> = {};
    if (config) {
      for (const { key, type } of config.settingsKeys) {
        const value = allSettings[key] || "";
        if (type === "password" && value) {
          settingsData[key] = value.length > 4
            ? "*".repeat(value.length - 4) + value.slice(-4)
            : "****";
        } else {
          settingsData[key] = value;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        marketplace,
        marketplaceDisplayName: config?.displayName || marketplace,
        settingsKeys: config?.settingsKeys || [],
        settings: settingsData,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/SETTINGS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { id: true, marketplace: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Bayi bulunamadi" }, { status: 404 });
    }

    const marketplace = tenant.marketplace as MarketplaceName;
    const config = MARKETPLACE_SETTINGS[marketplace];

    if (!config) {
      return NextResponse.json(
        { error: "Marketplace yapilandirmasi bulunamadi" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const allowedKeys = new Set(config.settingsKeys.map((s) => s.key));
    const updates: Array<{ key: string; value: string }> = [];

    for (const [key, value] of Object.entries(body)) {
      if (!allowedKeys.has(key)) continue;
      if (typeof value !== "string") continue;

      // Skip masked password values (user didn't change it)
      if (value.startsWith("*") && value.endsWith("*")) continue;
      if (/^\*+.{0,4}$/.test(value)) continue;

      updates.push({ key, value });
    }

    for (const { key, value } of updates) {
      await setTenantSetting(tenantId, key, value);
    }

    return NextResponse.json({
      success: true,
      message: `${updates.length} ayar güncellendi`,
      updatedKeys: updates.map((u) => u.key),
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/SETTINGS] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getTenantSettings, setTenantSetting } from "@/lib/tenant-settings";
import { CARGO_SETTINGS, CARGO_PROVIDER_NAMES } from "@/lib/cargo/settings-map";
import type { CargoProviderName } from "@/lib/cargo/types";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const allSettings = await getTenantSettings(tenantId);

    const currentProvider = (allSettings["cargo_provider"] || "") as string;
    const config = CARGO_SETTINGS[currentProvider as CargoProviderName];

    // Build settings data, masking passwords
    const settingsData: Record<string, string> = {};
    if (config) {
      for (const { key, type } of config.settingsKeys) {
        const value = allSettings[key] || "";
        if (type === "password" && value) {
          settingsData[key] =
            value.length > 4
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
        provider: currentProvider,
        providerDisplayName: config?.displayName || "",
        settingsKeys: config?.settingsKeys || [],
        settings: settingsData,
        availableProviders: CARGO_PROVIDER_NAMES.map((name) => ({
          value: name,
          label: CARGO_SETTINGS[name].displayName,
        })),
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/CARGO/SETTINGS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const body = await request.json();

    const { provider, settings: newSettings } = body as {
      provider?: string;
      settings?: Record<string, string>;
    };

    if (!provider || !CARGO_PROVIDER_NAMES.includes(provider as CargoProviderName)) {
      return NextResponse.json(
        { error: "Gecersiz kargo firması" },
        { status: 400 }
      );
    }

    // Save cargo provider
    await setTenantSetting(tenantId, "cargo_provider", provider);

    // Save provider-specific settings
    const config = CARGO_SETTINGS[provider as CargoProviderName];
    const allowedKeys = new Set(config.settingsKeys.map((s) => s.key));
    const updates: string[] = [];

    if (newSettings && typeof newSettings === "object") {
      for (const [key, value] of Object.entries(newSettings)) {
        if (!allowedKeys.has(key)) continue;
        if (typeof value !== "string") continue;

        // Skip masked password values
        if (value.startsWith("*") && value.endsWith("*")) continue;
        if (/^\*+.{0,4}$/.test(value)) continue;

        await setTenantSetting(tenantId, key, value);
        updates.push(key);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Kargo ayarlari kaydedildi (${updates.length + 1} ayar)`,
      updatedKeys: ["cargo_provider", ...updates],
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/CARGO/SETTINGS] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { resolveCredentials } from "@/lib/marketplace/credential-resolver";
import { getAdapter } from "@/lib/marketplace/registry";
import type { MarketplaceName } from "@/lib/marketplace/types";

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { marketplace: true },
    });

    if (!tenant?.marketplace) {
      return NextResponse.json({ error: "Marketplace tanımlı değil" }, { status: 400 });
    }

    const marketplace = tenant.marketplace as MarketplaceName;
    const credentials = await resolveCredentials(tenantId, marketplace);

    if (!credentials) {
      return NextResponse.json({ error: "Credentials bulunamadı. Lütfen ayarlarınızı kaydedin." }, { status: 400 });
    }

    // Check which required fields are missing
    const config = (await import("@/lib/marketplace/settings-map")).MARKETPLACE_SETTINGS[marketplace];
    const missingFields: string[] = [];
    if (config) {
      for (const { key, label, group } of config.settingsKeys) {
        if (group === "pricing") continue;
        const val = credentials[key as keyof typeof credentials];
        if (!val || (typeof val === "string" && !val.trim())) {
          missingFields.push(label);
        }
      }
    }

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Eksik alanlar: ${missingFields.join(", ")}. Lütfen önce kaydedin.` },
        { status: 422 }
      );
    }

    const adapter = getAdapter(marketplace);
    let valid = false;
    let errorDetail = "";
    try {
      valid = await adapter.validateCredentials(credentials);
    } catch (err) {
      errorDetail = err instanceof Error ? err.message : String(err);
    }

    if (valid) {
      return NextResponse.json({ success: true, message: "Bağlantı başarılı!" });
    } else {
      const msg = errorDetail
        ? `Bağlantı başarısız: ${errorDetail}`
        : "Bağlantı başarısız. Bilgileri kontrol edin.";
      return NextResponse.json({ error: msg }, { status: 422 });
    }
  } catch (error) {
    console.error("Settings test error:", error);
    const detail = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: `Test sırasında hata oluştu${detail ? ": " + detail : ""}` }, { status: 500 });
  }
}

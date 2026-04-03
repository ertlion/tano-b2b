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

    const adapter = getAdapter(marketplace);
    const valid = await adapter.validateCredentials(credentials);

    if (valid) {
      return NextResponse.json({ success: true, message: "Bağlantı başarılı!" });
    } else {
      return NextResponse.json(
        { error: "Bağlantı başarısız. Bilgileri kontrol edin." },
        { status: 422 }
      );
    }
  } catch (error) {
    console.error("Settings test error:", error);
    return NextResponse.json({ error: "Test sırasında hata oluştu" }, { status: 500 });
  }
}

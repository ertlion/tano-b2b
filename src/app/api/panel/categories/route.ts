import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getAdapter } from "@/lib/marketplace/registry";
import { resolveCredentials } from "@/lib/marketplace/credential-resolver";
import type { MarketplaceName } from "@/lib/marketplace/types";

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId") || undefined;

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { id: true, marketplace: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Bayi bulunamadi" }, { status: 404 });
    }

    const marketplace = tenant.marketplace as MarketplaceName;
    const adapter = getAdapter(marketplace);

    if (!adapter.getCategories) {
      return NextResponse.json(
        { error: "Bu marketplace kategori cekmeyi desteklemiyor" },
        { status: 400 }
      );
    }

    const credentials = await resolveCredentials(tenantId, marketplace);
    if (!credentials) {
      return NextResponse.json(
        { error: "Marketplace kimlik bilgileri yapilandirilmamis" },
        { status: 400 }
      );
    }

    const categories = await adapter.getCategories(credentials, parentId);

    return NextResponse.json({ success: true, data: categories });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/CATEGORIES] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { syncMasterCatalogFromIkas, getMasterIkasCredentials } from "@/lib/ikas-master-sync";

export const dynamic = "force-dynamic";

// Cron: ikas master stok reconciliation (fallback). Webhook kaçaklarını yakalar.
// Header: x-cron-secret veya ?secret=...  ($WEBHOOK_SECRET / $CRON_SECRET ile eşleşmeli)
function authorize(request: NextRequest): boolean {
  const expected = process.env.WEBHOOK_SECRET || process.env.CRON_SECRET;
  if (!expected) {
    console.warn("[CRON/ikas-sync] WEBHOOK_SECRET tanımsız - cron koruması yok");
    return true;
  }
  const headerVal = request.headers.get("x-cron-secret");
  const queryVal = request.nextUrl.searchParams.get("secret");
  return headerVal === expected || queryVal === expected;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!getMasterIkasCredentials()) {
    return NextResponse.json({ skipped: true, reason: "IKAS_MASTER_* tanımsız" });
  }
  const summary = await syncMasterCatalogFromIkas();
  return NextResponse.json({ success: summary.errors.length === 0, data: summary });
}

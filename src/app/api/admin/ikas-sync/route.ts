import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { syncMasterCatalogFromIkas, getMasterIkasCredentials } from "@/lib/ikas-master-sync";

export const dynamic = "force-dynamic";

// Admin: ikas master kataloğunu elle senkronize et (ateliertano).
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    if (!getMasterIkasCredentials()) {
      return NextResponse.json(
        { error: "ikas master credential'ları (IKAS_MASTER_*) tanımlı değil" },
        { status: 400 }
      );
    }

    const summary = await syncMasterCatalogFromIkas();
    return NextResponse.json({ success: summary.errors.length === 0, data: summary });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[ADMIN/IKAS-SYNC] error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

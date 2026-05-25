import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getBalances, getTransactions } from "@/lib/balance";

export const dynamic = "force-dynamic";

// Üyenin kendi bakiyeleri + son hareketleri
export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const balances = await getBalances(tenantId);
    const transactions = await getTransactions(tenantId, 30);
    return NextResponse.json({ success: true, data: { balances, transactions } });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[PANEL/BALANCE] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

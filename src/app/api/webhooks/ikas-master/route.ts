import { NextRequest, NextResponse } from "next/server";
import { applyIkasStockUpdate, syncMasterCatalogFromIkas } from "@/lib/ikas-master-sync";

export const dynamic = "force-dynamic";

// ikas Master (ateliertano) webhook — gerçek zamanlı stok güncellemeleri (Epic A).
// ikas payload şekli mağazaya göre değişebildiği için parsing savunmacıdır;
// stok çıkarılamazsa cron reconciliation yedeği devreye girer.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseData(payload: any): any {
  const raw = payload?.data ?? payload;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return payload;
    }
  }
  return raw;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStockUpdates(data: any): Array<{ variantId: string; stock: number }> {
  const out: Array<{ variantId: string; stock: number }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visitVariant = (v: any) => {
    if (!v) return;
    const variantId = v.variantId ?? v.id ?? v.productVariantId;
    let stock: number | undefined;
    if (Array.isArray(v.stocks)) {
      stock = v.stocks.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: number, x: any) => s + (Number(x?.stockCount) || 0),
        0
      );
    } else if (v.stockCount != null) {
      stock = Number(v.stockCount);
    } else if (v.stock != null) {
      stock = Number(v.stock);
    }
    if (variantId != null && stock != null && !Number.isNaN(stock)) {
      out.push({ variantId: String(variantId), stock });
    }
  };

  if (Array.isArray(data?.variants)) data.variants.forEach(visitVariant);
  if (Array.isArray(data?.productVariants)) data.productVariants.forEach(visitVariant);
  // Tek varyantlık stok event'i
  if (data?.variantId || data?.productVariantId) visitVariant(data);
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const data = parseData(payload);
    const updates = extractStockUpdates(data);

    if (updates.length === 0) {
      // Parse edilemedi → güvenli tarafta kalıp tam senkron tetikle (fire-and-forget)
      syncMasterCatalogFromIkas().catch((e) =>
        console.error("[WEBHOOK/ikas-master] fallback resync failed:", e)
      );
      return NextResponse.json({ ok: true, mode: "fallback-resync" });
    }

    let applied = 0;
    for (const u of updates) {
      const ok = await applyIkasStockUpdate(u.variantId, u.stock);
      if (ok) applied += 1;
    }

    return NextResponse.json({ ok: true, applied, received: updates.length });
  } catch (error) {
    console.error("[WEBHOOK/ikas-master] error:", error);
    return NextResponse.json({ error: "Webhook hatası" }, { status: 500 });
  }
}

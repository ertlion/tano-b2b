import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { purgeNonIkasProducts } from "@/lib/ikas-master-sync";

export const dynamic = "force-dynamic";

// Admin: ikas-dışı (eski) master ürünleri ve bağımlılarını sil. Master katalog sadece ikas.
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const result = await purgeNonIkasProducts();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[ADMIN/PURGE-NON-IKAS] error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

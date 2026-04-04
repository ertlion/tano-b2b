import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadParasutConfig } from "@/lib/parasut-config";
import { testConnection } from "@/lib/parasut";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const config = await loadParasutConfig();
    if (!config) {
      return NextResponse.json(
        { error: "Parasut ayarlari eksik. Once ayarlari kaydedin." },
        { status: 400 }
      );
    }

    const result = await testConnection(config);

    if (result.success) {
      return NextResponse.json({ success: true, message: "Parasut baglantisi basarili!" });
    }

    return NextResponse.json(
      { error: `Baglanti basarisiz: ${result.error}` },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

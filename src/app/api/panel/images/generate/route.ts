import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants, aiImageJobs, generatedImages, masterProducts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { deductBalance, addBalance, getBalance } from "@/lib/balance";
import { buildPrompt } from "@/lib/image-presets";
import { imageProvider } from "@/lib/image-provider";
import { uploadBuffer, storageConfigured } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body {
  masterProductId?: number;
  sourceImages?: Array<{ mimeType: string; base64: string }>;
  sourceImageUrls?: string[];
  sceneId: string;
  modelId: string;
  angleId: string;
  count?: number;
  aspectRatio?: string;
  extraNote?: string;
}

async function urlToBase64(url: string): Promise<{ mimeType: string; base64: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { mimeType, base64: buf.toString("base64") };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    if (!(await imageProvider.configured())) {
      return NextResponse.json({ error: "Görsel motoru yapılandırılmamış (Gemini)" }, { status: 503 });
    }
    if (!(await storageConfigured())) {
      return NextResponse.json({ error: "Görsel depolama yapılandırılmamış (S3)" }, { status: 503 });
    }

    const body = (await request.json()) as Body;
    const count = Math.min(10, Math.max(1, Number(body.count) || 1));

    if (!body.sceneId || !body.modelId || !body.angleId) {
      return NextResponse.json({ error: "Mekan, manken ve açı seçilmeli" }, { status: 400 });
    }

    // Kaynak görseller
    const sources: Array<{ mimeType: string; base64: string }> = [];
    if (Array.isArray(body.sourceImages)) sources.push(...body.sourceImages.filter((s) => s?.base64));
    for (const u of body.sourceImageUrls || []) {
      const c = await urlToBase64(u);
      if (c) sources.push(c);
    }
    if (sources.length === 0) {
      return NextResponse.json({ error: "En az bir kaynak ürün görseli gerekli" }, { status: 400 });
    }

    // Bakiye / fiyat
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { imageUnitPrice: true },
    });
    const unit = Number(tenant?.imageUnitPrice) || 0;
    if (unit <= 0) {
      return NextResponse.json({ error: "Görsel birim fiyatınız tanımlı değil, admin ile görüşün" }, { status: 400 });
    }
    const cost = Math.round(unit * count * 100) / 100;

    const ded = await deductBalance(tenantId, "image", cost, "image_gen", {
      reference: `görsel×${count}`,
    });
    if (!ded.ok) {
      return NextResponse.json(
        { error: `Yetersiz görsel bakiyesi. Gerekli: ${cost} ₺, mevcut: ${await getBalance(tenantId, "image")} ₺`, code: "INSUFFICIENT_BALANCE" },
        { status: 402 }
      );
    }

    // İş kaydı
    const product = body.masterProductId
      ? await db.query.masterProducts.findFirst({ where: eq(masterProducts.id, body.masterProductId), columns: { name: true } })
      : null;
    const [job] = await db
      .insert(aiImageJobs)
      .values({
        tenantId,
        masterProductId: body.masterProductId ?? null,
        params: { sceneId: body.sceneId, modelId: body.modelId, angleId: body.angleId, count },
        count,
        cost: String(cost),
        status: "processing",
      })
      .returning({ id: aiImageJobs.id });

    const prompt = buildPrompt({
      sceneId: body.sceneId,
      modelId: body.modelId,
      angleId: body.angleId,
      productName: product?.name,
      extraNote: body.extraNote,
    });

    const urls: string[] = [];
    let produced = 0;
    for (let i = 0; i < count; i++) {
      try {
        const gen = await imageProvider.generate({
          prompt,
          sourceImages: sources,
          aspectRatio: body.aspectRatio,
        });
        const buf = Buffer.from(gen.base64, "base64");
        const ext = gen.mimeType.includes("jpeg") ? "jpg" : "png";
        const key = `tenants/${tenantId}/ai/${job.id}-${i}-${Date.now()}.${ext}`;
        const url = await uploadBuffer(key, buf, gen.mimeType);
        await db.insert(generatedImages).values({
          jobId: job.id,
          tenantId,
          masterProductId: body.masterProductId ?? null,
          url,
          sortOrder: i,
        });
        urls.push(url);
        produced++;
      } catch (e) {
        console.error("[IMAGES/GENERATE] üretim hatası:", e);
      }
    }

    // Üretilemeyenlerin bakiyesini iade et
    const failed = count - produced;
    if (failed > 0) {
      await addBalance(tenantId, "image", Math.round(unit * failed * 100) / 100, "refund", {
        reference: `görsel iade ×${failed}`,
      });
    }

    await db
      .update(aiImageJobs)
      .set({ status: produced > 0 ? "done" : "failed", completedAt: new Date(), error: produced === 0 ? "Hiç görsel üretilemedi" : null })
      .where(eq(aiImageJobs.id, job.id));

    if (produced === 0) {
      return NextResponse.json({ error: "Görsel üretilemedi, bakiye iade edildi" }, { status: 502 });
    }

    return NextResponse.json({ success: true, data: { jobId: job.id, produced, failed, urls } });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[PANEL/IMAGES/GENERATE] error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { appConfig } from "@/lib/schema";
import { setConfigValue } from "@/lib/app-config";

export const dynamic = "force-dynamic";

// Entegrasyon ayarları (app_config). Secret değerler GET'te maskelenir.
interface Field {
  key: string;
  label: string;
  group: string;
  secret?: boolean;
}

const FIELDS: Field[] = [
  // ikas Master (ürün/stok kaynağı)
  { key: "ikas_master_store_url", label: "Mağaza (ör. ateliertano)", group: "ikas Master" },
  { key: "ikas_master_api_key", label: "API Key (Private App)", group: "ikas Master", secret: true },
  { key: "ikas_master_api_secret", label: "API Secret", group: "ikas Master", secret: true },
  { key: "ikas_master_access_token", label: "Access Token (opsiyonel/OAuth)", group: "ikas Master", secret: true },
  { key: "ikas_b2b_price_list_id", label: "Dolar B2B Fiyat Listesi ID", group: "ikas Master" },
  // ikas OAuth App (bayi onboarding)
  { key: "ikas_app_client_id", label: "Client ID", group: "ikas OAuth (Bayi)" },
  { key: "ikas_app_client_secret", label: "Client Secret", group: "ikas OAuth (Bayi)", secret: true },
  // PayTR
  { key: "paytr_merchant_id", label: "Merchant ID", group: "PayTR" },
  { key: "paytr_merchant_key", label: "Merchant Key", group: "PayTR", secret: true },
  { key: "paytr_merchant_salt", label: "Merchant Salt", group: "PayTR", secret: true },
  { key: "paytr_test_mode", label: "Test Modu (1/0)", group: "PayTR" },
  // Gemini
  { key: "gemini_api_key", label: "API Key", group: "AI Görsel (Gemini)", secret: true },
  { key: "gemini_image_model", label: "Model (varsayılan gemini-3-pro-image-preview)", group: "AI Görsel (Gemini)" },
  // S3 storage
  { key: "s3_endpoint", label: "Endpoint (R2/MinIO; S3 ise boş)", group: "Görsel Depolama (S3)" },
  { key: "s3_region", label: "Region (S3) / auto (R2)", group: "Görsel Depolama (S3)" },
  { key: "s3_bucket", label: "Bucket", group: "Görsel Depolama (S3)" },
  { key: "s3_access_key", label: "Access Key", group: "Görsel Depolama (S3)", secret: true },
  { key: "s3_secret_key", label: "Secret Key", group: "Görsel Depolama (S3)", secret: true },
  { key: "s3_public_url", label: "Public URL (CDN/bucket base)", group: "Görsel Depolama (S3)" },
];

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const rows = await db.query.appConfig.findMany();
    const stored = new Map(rows.map((r) => [r.key, r.value ?? ""]));

    const fields = FIELDS.map((f) => {
      const val = stored.get(f.key) ?? "";
      const isSet = val.trim() !== "";
      return {
        key: f.key,
        label: f.label,
        group: f.group,
        secret: Boolean(f.secret),
        isSet,
        // Secret ise değeri gönderme; değilse gönder.
        value: f.secret ? "" : val,
      };
    });
    return NextResponse.json({ success: true, data: fields });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[ADMIN/INTEGRATIONS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const allowed = new Set(FIELDS.map((f) => f.key));
    let updated = 0;
    for (const [key, raw] of Object.entries(body || {})) {
      if (!allowed.has(key)) continue;
      const value = typeof raw === "string" ? raw : "";
      // Boş gönderilen alanlar (özellikle maskeli secret'lar) mevcut değeri korur.
      if (value.trim() === "") continue;
      await setConfigValue(key, value.trim());
      updated++;
    }
    return NextResponse.json({ success: true, data: { updated } });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[ADMIN/INTEGRATIONS] PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

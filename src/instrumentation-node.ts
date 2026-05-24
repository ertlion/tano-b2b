// Uygulama açılışında idempotent migration'ları çalıştırır (Tano Toptan Faz 1+).
// Idempotent (IF NOT EXISTS / DROP IF EXISTS / ON CONFLICT) olduğu için her boot'ta güvenli.
// Coolify deploy'unda prod DB'yi otomatik günceller — manuel DB erişimi gerekmez.

export async function runMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] DATABASE_URL yok, atlanıyor");
    return;
  }

  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1 });

  // Her biri bağımsız ve idempotent. Sırayla çalışır; biri hata verirse loglanır, devam edilir.
  const statements: string[] = [
    // ── 0002: sipariş akışı + SKU eşleme + ikas sync state ──
    `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "invoice_file_url" text`,
    `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cargo_label_file_url" text`,
    `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "invoice_uploaded_at" timestamp`,
    `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stock_applied" boolean DEFAULT false NOT NULL`,
    `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'bekleniyor'`,
    `CREATE TABLE IF NOT EXISTS "tenant_variant_skus" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
      "master_variant_id" integer NOT NULL REFERENCES "master_variants"("id"),
      "marketplace" varchar(50) NOT NULL,
      "store_sku" varchar(150) NOT NULL,
      "store_barcode" varchar(150) NOT NULL,
      "external_product_id" varchar(255),
      "external_variant_id" varchar(255),
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_variant_skus_store_sku_unique') THEN
        ALTER TABLE "tenant_variant_skus" ADD CONSTRAINT "tenant_variant_skus_store_sku_unique" UNIQUE ("store_sku"); END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_variant_skus_store_barcode_unique') THEN
        ALTER TABLE "tenant_variant_skus" ADD CONSTRAINT "tenant_variant_skus_store_barcode_unique" UNIQUE ("store_barcode"); END IF;
    END $$`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "tenant_variant_skus_unique_idx" ON "tenant_variant_skus" ("tenant_id", "master_variant_id", "marketplace")`,
    `CREATE TABLE IF NOT EXISTS "ikas_sync_state" (
      "id" serial PRIMARY KEY NOT NULL,
      "key" varchar(100) NOT NULL,
      "value" text,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ikas_sync_state_key_unique') THEN
        ALTER TABLE "ikas_sync_state" ADD CONSTRAINT "ikas_sync_state_key_unique" UNIQUE ("key"); END IF;
    END $$`,
    // ── 0003: master_variants barkod unique kaldır (ikas'ta barkod benzersiz değil) ──
    `ALTER TABLE "master_variants" DROP CONSTRAINT IF EXISTS "master_variants_barcode_unique"`,
    // ── 0004: USD B2B fiyatlandırma ──
    `ALTER TABLE "master_variants" ADD COLUMN IF NOT EXISTS "usd_price" numeric(10,2) DEFAULT '0' NOT NULL`,
    `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "default_markup_percent" numeric(6,2) DEFAULT '0' NOT NULL`,
    `CREATE TABLE IF NOT EXISTS "app_config" (
      "id" serial PRIMARY KEY NOT NULL,
      "key" varchar(100) NOT NULL,
      "value" text,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_config_key_unique') THEN
        ALTER TABLE "app_config" ADD CONSTRAINT "app_config_key_unique" UNIQUE ("key"); END IF;
    END $$`,
    `CREATE TABLE IF NOT EXISTS "tenant_variant_prices" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
      "master_variant_id" integer NOT NULL REFERENCES "master_variants"("id"),
      "mode" varchar(10) NOT NULL,
      "percent" numeric(6,2),
      "manual_price_try" numeric(10,2),
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "tenant_variant_prices_unique_idx" ON "tenant_variant_prices" ("tenant_id", "master_variant_id")`,
    `INSERT INTO "app_config" ("key", "value") VALUES ('usd_try_rate', '45.5') ON CONFLICT ("key") DO NOTHING`,
    `INSERT INTO "app_config" ("key", "value") VALUES ('ikas_b2b_price_list_id', 'e8cf9a61-ac0e-495a-9d9e-8be79a6ece94') ON CONFLICT ("key") DO NOTHING`,
  ];

  try {
    for (const s of statements) {
      await sql.unsafe(s);
    }
    console.log(`[migrate] ${statements.length} ifade uygulandı (idempotent)`);
  } catch (e) {
    console.error("[migrate] hata (uygulama yine de başlatılıyor):", e);
  } finally {
    await sql.end();
  }
}

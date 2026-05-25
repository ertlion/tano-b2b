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
    // ── 0001: XML/ikas entegrasyonu (eski prod'da uygulanmamış olabilir) ──
    `ALTER TABLE "master_products" ADD COLUMN IF NOT EXISTS "external_id" varchar(100)`,
    `ALTER TABLE "master_products" ADD COLUMN IF NOT EXISTS "source" varchar(20) DEFAULT 'manual' NOT NULL`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_products_external_id_unique') THEN
        ALTER TABLE "master_products" ADD CONSTRAINT "master_products_external_id_unique" UNIQUE ("external_id"); END IF;
    END $$`,
    `ALTER TABLE "master_variants" ADD COLUMN IF NOT EXISTS "external_id" varchar(100)`,
    `ALTER TABLE "master_variants" ADD COLUMN IF NOT EXISTS "images" json DEFAULT '[]'::json NOT NULL`,
    `CREATE TABLE IF NOT EXISTS "xml_feeds" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar(255) NOT NULL,
      "url" text NOT NULL,
      "interval_minutes" integer DEFAULT 60 NOT NULL,
      "is_active" boolean DEFAULT true NOT NULL,
      "last_run_at" timestamp,
      "last_run_status" varchar(20),
      "last_run_summary" json,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )`,
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
    // ── 0005: bakiye/cüzdan (Epic E) ──
    `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "image_unit_price" numeric(10,2) DEFAULT '0' NOT NULL`,
    `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "allow_action_without_balance" boolean DEFAULT false NOT NULL`,
    `CREATE TABLE IF NOT EXISTS "balances" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
      "type" varchar(10) NOT NULL,
      "amount" numeric(12,2) DEFAULT '0' NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "balances_tenant_type_idx" ON "balances" ("tenant_id", "type")`,
    `CREATE TABLE IF NOT EXISTS "balance_transactions" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
      "type" varchar(10) NOT NULL,
      "amount" numeric(12,2) NOT NULL,
      "balance_after" numeric(12,2) NOT NULL,
      "reason" varchar(30) NOT NULL,
      "reference" varchar(255),
      "note" text,
      "created_at" timestamp DEFAULT now() NOT NULL
    )`,
    `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "balance_charged" numeric(12,2) DEFAULT '0' NOT NULL`,
    // ── 0006: PayTR bakiye yükleme (Epic F) ──
    `CREATE TABLE IF NOT EXISTS "balance_topups" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
      "merchant_oid" varchar(64) NOT NULL,
      "balance_type" varchar(10) NOT NULL,
      "amount" numeric(12,2) NOT NULL,
      "status" varchar(20) DEFAULT 'pending' NOT NULL,
      "fail_reason" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "completed_at" timestamp
    )`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'balance_topups_merchant_oid_unique') THEN
        ALTER TABLE "balance_topups" ADD CONSTRAINT "balance_topups_merchant_oid_unique" UNIQUE ("merchant_oid"); END IF;
    END $$`,
  ];

  let ok = 0;
  let fail = 0;
  for (const s of statements) {
    try {
      await sql.unsafe(s);
      ok++;
    } catch (e) {
      fail++;
      console.error(`[migrate] ifade hatası (atlandı): ${(e as Error).message} :: ${s.slice(0, 80)}`);
    }
  }
  await sql.end();
  console.log(`[migrate] tamam: ${ok} başarılı, ${fail} hatalı (idempotent)`);
}

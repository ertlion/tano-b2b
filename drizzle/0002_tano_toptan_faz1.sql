-- ─── TANO TOPTAN — FAZ 1 MIGRATION ────────────────────────────
-- 2026-05-24: Mağaza bazlı SKU/barkod eşleme (Epic J), ikas sync state (Epic A),
--             sipariş akışı + tek havuz stok idempotency (Epic D/B)
-- Tüm ALTER/CREATE'ler idempotent (IF NOT EXISTS) — birden çok kez çalıştırılabilir.

-- ── orders: manuel fatura/etiket + idempotency + yeni status varsayılanı ──
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "invoice_file_url" text;
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "cargo_label_file_url" text;
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "invoice_uploaded_at" timestamp;
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "stock_applied" boolean DEFAULT false NOT NULL;

-- Yeni siparişler için varsayılan durum: bekleniyor
ALTER TABLE "orders"
  ALTER COLUMN "status" SET DEFAULT 'bekleniyor';

-- ── tenant_variant_skus: mağaza bazlı SKU/barkod eşleme ──
CREATE TABLE IF NOT EXISTS "tenant_variant_skus" (
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
);

-- store_sku ve store_barcode global benzersiz (sipariş ters eşleme + buybox engelleme)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_variant_skus_store_sku_unique') THEN
    ALTER TABLE "tenant_variant_skus" ADD CONSTRAINT "tenant_variant_skus_store_sku_unique" UNIQUE ("store_sku");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_variant_skus_store_barcode_unique') THEN
    ALTER TABLE "tenant_variant_skus" ADD CONSTRAINT "tenant_variant_skus_store_barcode_unique" UNIQUE ("store_barcode");
  END IF;
END $$;

-- (tenant, master_variant, marketplace) tekil — aynı varyant aynı kanala bir kez eşlenir
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_variant_skus_unique_idx"
  ON "tenant_variant_skus" ("tenant_id", "master_variant_id", "marketplace");

-- ── ikas_sync_state: ikas master sync cursor / durum (key-value) ──
CREATE TABLE IF NOT EXISTS "ikas_sync_state" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" varchar(100) NOT NULL,
  "value" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ikas_sync_state_key_unique') THEN
    ALTER TABLE "ikas_sync_state" ADD CONSTRAINT "ikas_sync_state_key_unique" UNIQUE ("key");
  END IF;
END $$;

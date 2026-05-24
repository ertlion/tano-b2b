-- ─── XML İÇE AKTARMA & GÖRSEL ENTEGRASYONU MIGRATION ───────────
-- 2026-05-16: Tano B2B XML feed desteği + varyant görselleri
-- ALTER'ler idempotent (IF NOT EXISTS) — birden çok kez çalıştırılabilir.

-- master_products: external_id (XML/marketplace UUID eşleme), source (manuel/xml/excel)
ALTER TABLE "master_products"
  ADD COLUMN IF NOT EXISTS "external_id" varchar(100);
ALTER TABLE "master_products"
  ADD COLUMN IF NOT EXISTS "source" varchar(20) DEFAULT 'manual' NOT NULL;

-- Unique constraint external_id üzerine (NULL'lar duplicate sayılmaz)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'master_products_external_id_unique'
  ) THEN
    ALTER TABLE "master_products"
      ADD CONSTRAINT "master_products_external_id_unique" UNIQUE ("external_id");
  END IF;
END $$;

-- master_variants: external_id + images (varyant başına görsel listesi)
ALTER TABLE "master_variants"
  ADD COLUMN IF NOT EXISTS "external_id" varchar(100);
ALTER TABLE "master_variants"
  ADD COLUMN IF NOT EXISTS "images" json DEFAULT '[]'::json NOT NULL;

-- xml_feeds: kayıtlı XML kaynakları (otomatik çekim için)
CREATE TABLE IF NOT EXISTS "xml_feeds" (
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
);

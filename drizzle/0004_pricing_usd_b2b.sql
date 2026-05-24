-- ─── TANO TOPTAN — USD B2B Fiyatlandırma ──────────────────────
-- 2026-05-24: Fiyat temeli ikas "Dolar B2B" (USD). Admin USD→TL kuru belirler.
-- Üyeler kendi fiyatını koyar (yüzde markup veya manuel TL). İdempotent.

ALTER TABLE "master_variants"
  ADD COLUMN IF NOT EXISTS "usd_price" numeric(10,2) DEFAULT '0' NOT NULL;

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "default_markup_percent" numeric(6,2) DEFAULT '0' NOT NULL;

CREATE TABLE IF NOT EXISTS "app_config" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" varchar(100) NOT NULL,
  "value" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_config_key_unique') THEN
    ALTER TABLE "app_config" ADD CONSTRAINT "app_config_key_unique" UNIQUE ("key");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "tenant_variant_prices" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
  "master_variant_id" integer NOT NULL REFERENCES "master_variants"("id"),
  "mode" varchar(10) NOT NULL,
  "percent" numeric(6,2),
  "manual_price_try" numeric(10,2),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_variant_prices_unique_idx"
  ON "tenant_variant_prices" ("tenant_id", "master_variant_id");

-- Varsayılan global ayarlar
INSERT INTO "app_config" ("key", "value") VALUES ('usd_try_rate', '45.5')
  ON CONFLICT ("key") DO NOTHING;
INSERT INTO "app_config" ("key", "value") VALUES ('ikas_b2b_price_list_id', 'e8cf9a61-ac0e-495a-9d9e-8be79a6ece94')
  ON CONFLICT ("key") DO NOTHING;

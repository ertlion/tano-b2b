-- ─── TANO TOPTAN — PayTR bakiye yükleme (Epic F) ──────────────
-- 2026-05-25: balance_topups (idempotent merchant_oid). İdempotent.

CREATE TABLE IF NOT EXISTS "balance_topups" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
  "merchant_oid" varchar(64) NOT NULL,
  "balance_type" varchar(10) NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "fail_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'balance_topups_merchant_oid_unique') THEN
    ALTER TABLE "balance_topups" ADD CONSTRAINT "balance_topups_merchant_oid_unique" UNIQUE ("merchant_oid");
  END IF;
END $$;

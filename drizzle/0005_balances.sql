-- ─── TANO TOPTAN — Bakiye/Cüzdan (Epic E) ─────────────────────
-- 2026-05-25: İki tip bakiye (product/image) + ledger + tenant ayarları. İdempotent.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "image_unit_price" numeric(10,2) DEFAULT '0' NOT NULL;
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "allow_action_without_balance" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "balances" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
  "type" varchar(10) NOT NULL,
  "amount" numeric(12,2) DEFAULT '0' NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "balances_tenant_type_idx" ON "balances" ("tenant_id", "type");

CREATE TABLE IF NOT EXISTS "balance_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
  "type" varchar(10) NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "balance_after" numeric(12,2) NOT NULL,
  "reason" varchar(30) NOT NULL,
  "reference" varchar(255),
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

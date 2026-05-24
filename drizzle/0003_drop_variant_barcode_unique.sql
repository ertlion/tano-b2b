-- ─── TANO TOPTAN — master_variants barkod unique kaldır ──────
-- 2026-05-24: ikas'ta barkodlar benzersiz değil (placeholder/tekrar eden barkodlar).
-- Gerçek benzersiz mağaza barkodları tenant_variant_skus'ta (Epic J). İdempotent.

ALTER TABLE "master_variants" DROP CONSTRAINT IF EXISTS "master_variants_barcode_unique";

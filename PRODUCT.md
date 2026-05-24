# Tano B2B — Ürün Dokümanı

> **Sürüm:** 0.1.0  · **Stack:** Next.js 14 (App Router) + TypeScript + Drizzle ORM + PostgreSQL + Redis/BullMQ + Tailwind
> **Mimari:** Çok kiracılı (multi-tenant) B2B SaaS — Tano Atelier bayi/pazaryeri yönetim platformu
> **Doküman tarihi:** 2026-05-24

---

## 1. Ürün Özeti

Tano B2B, **Tano Atelier**'in bayilerine (tenant) ve pazaryeri mağazalarına tek bir merkezden ürün, stok, sipariş, kargo ve fatura yönetimi sağlayan çok kiracılı bir SaaS platformudur. Master katalog tek noktada tutulur; her bayi kendi mağazasına/marketplace'ine yetkilendirildiği ürünleri push edebilir, stok ve siparişler otomatik senkronize edilir.

**Çözdüğü problem:** Bir markanın 10+ bayisi farklı pazaryerlerinde (Shopify, ikas, Trendyol, IdeaSoft, T-Soft) satış yaparken; stok tutarlılığı, sipariş takibi, kargo entegrasyonu, e-fatura ve cari takibi manuel ya da parçalı yapılıyor. Tano B2B bu süreçleri tek panele birleştirir.

---

## 2. Kullanıcı Rolleri

| Rol | Erişim | Yetenekler |
|-----|--------|-----------|
| **Admin** (Tano merkez) | `/admin/*` | Master ürün CRUD, bayi yönetimi, ürün-bayi izinleri, tüm siparişler/iadeler, fatura/cari, sync dashboard, XML feed yönetimi |
| **Tenant (Bayi)** | `/panel/*` | İzin verilen ürünleri görme, kendi mağazasına push, kendi siparişleri, iade talebi, fatura/ödeme görüntüleme, kargo |
| **Misafir** | `/login`, `/register` | Kayıt (onay bekler), ikas OAuth ile otomatik kayıt |

---

## 3. Temel Modüller

### 3.1 Katalog Yönetimi
- **Master Products / Master Variants:** Tek master katalog; renk + beden bazlı varyant, barkod, SKU, maliyet/satış fiyatı, stok adedi
- **Görseller:** Hem ürün hem varyant seviyesinde görsel listesi (JSON)
- **Kaynak takibi:** `source` alanı (`manual` / `xml` / `excel`) ve `external_id` ile dış sistem eşleme
- **Ürün izni:** `tenant_product_permissions` ile admin her bayinin hangi ürünleri görüp push edebileceğini kontrol eder

### 3.2 Pazaryeri Entegrasyonları (`src/lib/marketplace/adapters/`)
Adapter pattern + registry yapısı; her bayi kendi credential'larını saklar.

| Pazaryeri | Push | Stok Sync | Sipariş Webhook | Notlar |
|-----------|------|-----------|-----------------|--------|
| **Shopify** | ✓ | ✓ | ✓ (fulfillment, cancellation, payment) | Admin API token, HMAC kapalı, webhook auto-register |
| **ikas** | ✓ | ✓ | ✓ | Partner OAuth flow + iframe destek, register flow entegre |
| **Trendyol** | ✓ | ✓ | ✓ (orders) | Satıcı ID + API key |
| **IdeaSoft** | ✓ | ✓ | ✓ | Webhook |
| **T-Soft** | ✓ | ✓ | ✓ | Webhook |

### 3.3 Kargo Entegrasyonları (`src/lib/cargo/adapters/`)
- **Aras**, **Yurtiçi**, **MNG**, **Sürat**, **PTT** — gönderi oluşturma + takip URL'si
- Bayi başına credential ve varsayılan kargo şirketi ayarı

### 3.4 Sipariş Yönetimi
- Pazaryerinden gelen webhook → `orders` tablosu → durum geçişleri `order_status_history`'de loglu
- Akıllı varyant eşleme (renk/beden bazlı), iptal sebebi, kargo aksiyonları, müşteri/adres saklama
- Admin tüm bayilerin siparişlerini, bayi kendi siparişlerini görür

### 3.5 İade (Returns) Yönetimi
- Bayi iade talebi açar → admin onaylar/red eder
- Onaylanan iade stok hareketine çevrilir (`stock_movements`)

### 3.6 Fatura & Cari Takip
- Dönemsel fatura (period_start/end), kısmi ödeme desteği (`unpaid` / `partial` / `paid`)
- **Paraşüt entegrasyonu** ile e-fatura kesme (`parasut_invoice_id` eşleme)
- Ödeme tipleri: bank_transfer / cash / credit_card; refund desteği

### 3.7 XML Feed İçe Aktarma
- Kayıtlı XML kaynakları (`xml_feeds`) → cron ile periyodik çekim (`/api/cron/xml-feeds`)
- Idempotent: `external_id` ile mevcut ürün güncellenir, yeni olan eklenir
- Son çalışma zamanı/durumu/özeti DB'de saklanır

### 3.8 Excel İçe Aktarma
- xlsx ile toplu ürün/varyant yükleme
- Detaylı import log (eklenen/güncellenen/atlanan/hatalı)
- **Back-in-stock email:** Stok 0'dan pozitife geçince bildirim

### 3.9 Senkronizasyon Motoru (`src/lib/sync-engine.ts`)
- Stok değişikliklerini bağlı tüm pazaryerlerine yayma
- Detaylı sync log (`sync_logs`) — admin dashboard'da görüntülenir

### 3.10 Bildirim Sistemi
- `nodemailer` + SMTP — sipariş, iade, fatura, stok geri geldi bildirimleri

---

## 4. Teknik Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                       Next.js 14 (App Router)                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  /admin/*   │  │  /panel/*    │  │  /api/* (REST)         │  │
│  │  Admin UI   │  │  Bayi UI     │  │  webhooks, cron, panel │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
│                          │                                       │
│  ┌───────────────────────▼──────────────────────────────────┐    │
│  │   src/lib (auth, marketplace, cargo, sync, parasut,      │    │
│  │           xml-import, excel-import, mailer, order-proc)  │    │
│  └───────────────────────┬──────────────────────────────────┘    │
└──────────────────────────┼──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐       ┌──────────┐       ┌──────────────┐
   │Postgres │       │  Redis   │       │  External    │
   │(Drizzle)│       │ (BullMQ) │       │  APIs        │
   └─────────┘       └──────────┘       │ Shopify/ikas │
                                        │ Trendyol/... │
                                        │ Parasut/Kargo│
                                        └──────────────┘
```

**Dağıtım:** Docker (`Dockerfile` + `docker-compose.yml`) — Coolify uyumlu.

**Auth:** `bcryptjs` + session cookie (`SESSION_SECRET`). `src/middleware.ts` iframe CSP yönetimi.

**DB Migration:** Drizzle Kit (`drizzle.config.ts`, `drizzle/*.sql` idempotent).

---

## 5. Veri Modeli (Özet)

```
tenants ─┬─< settings
         ├─< tenant_products ──> master_products ──< master_variants ──< stock_movements
         ├─< tenant_product_permissions
         ├─< orders ──< order_status_history
         ├─< returns
         ├─< invoices ──< payments
         ├─< sync_logs
         └─< notifications

xml_feeds  (cron kaynakları)
```

---

## 6. Mevcut Durum (Tamamlanmış İşler)

> Son 30 commit'in özetidir; toplam **55 commit**, Nisan-Mayıs 2026 aralığında.

- ✅ Çok kiracılı altyapı + admin/bayi panel ayrımı
- ✅ Master ürün/varyant + Excel & XML import
- ✅ Shopify, ikas, Trendyol, IdeaSoft, T-Soft adapter'ları
- ✅ ikas Partner OAuth + iframe register flow
- ✅ Shopify webhook auto-registration, fulfillment/cancellation/payment
- ✅ Akıllı varyant eşleme (renk/beden)
- ✅ Push: sadece seçili + stoklu varyantlar, duplicate koruması
- ✅ Bayi başına ürün izin sistemi
- ✅ İade yönetimi (talep → onay → stok hareketi)
- ✅ Fatura + cari takip (kısmi ödeme, refund)
- ✅ Paraşüt e-fatura entegrasyonu
- ✅ Trendyol marketplace entegrasyonu (siparişler)
- ✅ 5 kargo API entegrasyonu (Yurtiçi, Aras, MNG, Sürat, PTT)
- ✅ Stok sync detaylı loglama
- ✅ Panel dashboard: günlük/aylık/toplam satış, maliyet, kar
- ✅ Admin Mağaza Sync dashboard
- ✅ Back-in-stock email bildirimi
- ✅ Sipariş sayfaları yeniden tasarım (ürün görseli, iptal sebebi, kargo butonu)

---

## 7. Önerilen Geliştirmeler (Roadmap)

> **Sunumda kullanmak üzere kategorize edilmiştir.** Önceliklendirme önerisi `P0` (kritik) → `P3` (nice-to-have).

### 7.1 Operasyonel Olgunluk

| # | Geliştirme | Öncelik | Etki |
|---|-----------|---------|------|
| 1 | **BullMQ job dashboard** (Bull Board) — sync/webhook job'larını UI'dan izleme | P1 | Operasyonel görünürlük |
| 2 | **Retry & dead-letter queue** webhook ve sync hataları için | P1 | Veri kaybı önleme |
| 3 | **Audit log** — kim, ne zaman, hangi master ürünü/izni değiştirdi | P1 | Uyumluluk, hata ayıklama |
| 4 | **Rate limiting** API ve login için (Redis tabanlı) | P0 | Güvenlik |
| 5 | **Health check + uptime monitoring** (`/api/health` mevcut, genişlet) | P2 | SLA takibi |
| 6 | **Hata izleme** Sentry entegrasyonu | P1 | Proaktif bug tespit |

### 7.2 Ürün & Katalog

| # | Geliştirme | Öncelik | Etki |
|---|-----------|---------|------|
| 7 | **Çoklu marka** desteği — `brand` alanı var ama admin UI'da brand filtresi/yönetim yok | P2 | Tano dışı markalara açılım |
| 8 | **Kategori ağacı** (hiyerarşik) — şu an `category`/`subcategory` flat string | P2 | Pazaryeri kategori eşleme kolaylığı |
| 9 | **Toplu ürün düzenleme** (bulk edit) — fiyat, kategori, izin | P1 | Operasyonel hız |
| 10 | **Ürün versiyonlama** — fiyat/stok geçmişi görüntüleme | P2 | Analiz, denetim |
| 11 | **Görsel CDN + lazy upload** (R2/S3) — şu an URL listesi olarak tutuluyor | P2 | Performans |
| 12 | **Barkod arama / QR scan** mobil için | P3 | UX |

### 7.3 Pazaryeri & Sync

| # | Geliştirme | Öncelik | Etki |
|---|-----------|---------|------|
| 13 | **Yeni pazaryeri:** Hepsiburada, n11, Çiçeksepeti adapter'ı | P1 | Pazar payı |
| 14 | **Pazaryeri kategori mapping UI** — `category_mapping` alanı var ama UI eksik | P1 | Onboarding hızı |
| 15 | **Sync queue önceliklendirme** — siparişler > stok > ürün | P2 | Müşteri deneyimi |
| 16 | **Webhook HMAC doğrulama** Shopify için tekrar açma (smart) | P0 | Güvenlik |
| 17 | **Conflict resolution UI** — aynı barkod iki pazaryerinde farklı fiyat/stok | P2 | Veri tutarlılığı |
| 18 | **Çift-yönlü sync** (pazaryerinden geri çekme) opsiyonel | P3 | Esneklik |

### 7.4 Sipariş & Kargo

| # | Geliştirme | Öncelik | Etki |
|---|-----------|---------|------|
| 19 | **Otomatik kargo etiketi** PDF üretimi + yazdırma | P1 | Operasyonel hız |
| 20 | **Toplu sipariş işleme** — seç, kargo ata, etiket bas | P1 | Bayi verimlilik |
| 21 | **Kargo takip otomasyonu** — durum değişikliklerinde müşteri SMS/email | P2 | Müşteri deneyimi |
| 22 | **Kısmi gönderim** (split shipment) | P2 | Esneklik |
| 23 | **Sipariş yaşlandırma raporu** — N gündür bekleyenler | P2 | SLA |

### 7.5 Finans & Raporlama

| # | Geliştirme | Öncelik | Etki |
|---|-----------|---------|------|
| 24 | **Cari ekstre PDF** + email ile gönderim | P1 | Bayi self-servis |
| 25 | **Otomatik fatura kesme** — dönemsel cron + Paraşüt | P1 | Manuel iş azalır |
| 26 | **Vade takibi + hatırlatma** — gecikmiş ödemelere otomatik mail | P1 | Tahsilat |
| 27 | **Komisyon hesaplama** — bayi `discountRate` üzerinden net kar raporu | P2 | Finansal görünürlük |
| 28 | **Dashboard genişletme** — bayi bazlı satış, en çok satan ürün, geri dönüş oranı | P1 | Yönetim kararı |
| 29 | **Excel/CSV export** raporlar için | P2 | Muhasebe entegrasyonu |

### 7.6 Bayi Deneyimi

| # | Geliştirme | Öncelik | Etki |
|---|-----------|---------|------|
| 30 | **Onboarding wizard** — yeni bayi için pazaryeri bağlama adımları | P1 | Aktivasyon |
| 31 | **Bildirim merkezi** — UI içi bell ikonu, real-time (SSE/WebSocket) | P2 | UX |
| 32 | **2FA / TOTP** bayi ve admin login | P1 | Güvenlik |
| 33 | **Bayi self-onboarding** — başvuru formu + KYC dokümanı yükleme | P2 | Operasyonel yük azalır |
| 34 | **Türkçe/İngilizce dil desteği** (i18n) | P3 | Uluslararası bayi |
| 35 | **Mobil-uyumlu UI revizyonu** | P2 | Bayi mobil kullanım |

### 7.7 Teknik Borç

| # | Geliştirme | Öncelik | Etki |
|---|-----------|---------|------|
| 36 | **Unit + integration test** altyapısı (mevcut sıfır test) | P0 | Regresyon önleme |
| 37 | **API tip güvenliği** — Zod ile request/response validation | P1 | Bug azaltma |
| 38 | **DB index review** — `external_id`, `tenant_id+status` indeksleri | P1 | Performans |
| 39 | **Soft delete** kritik tablolar için | P2 | Veri güvenliği |
| 40 | **Drizzle migration disiplini** — şu an tek `0001_xml_integration.sql` | P1 | Schema değişikliği güvenliği |
| 41 | **Next.js 15 + React 19 yükseltme** | P3 | Modernizasyon |

### 7.8 AI / Otomasyon (Opsiyonel)

| # | Geliştirme | Öncelik | Etki |
|---|-----------|---------|------|
| 42 | **AI ürün açıklaması** — kategori + özelliklerden otomatik description | P3 | İçerik hızı |
| 43 | **Stok tahmini** — geçmiş satıştan reorder noktası önerisi | P3 | Stok optimizasyonu |
| 44 | **Sipariş anomali tespiti** — şüpheli sipariş flag | P3 | Sahtekarlık önleme |

---

## 8. Önerilen 90 Günlük Plan

### Sprint 1-2 (Hafta 1-4) — Güvenlik & Stabilite
- #4 Rate limiting, #16 HMAC, #32 2FA
- #36 Test altyapısı + kritik path'lere test
- #6 Sentry, #2 Retry/DLQ

### Sprint 3-4 (Hafta 5-8) — Operasyonel Verimlilik
- #1 Bull Board, #3 Audit log, #14 Kategori mapping UI
- #19 Kargo etiketi, #20 Toplu sipariş, #9 Bulk edit
- #28 Dashboard genişletme

### Sprint 5-6 (Hafta 9-12) — Büyüme
- #13 Hepsiburada/n11 adapter
- #25 Otomatik fatura, #26 Vade takibi, #24 Cari ekstre PDF
- #30 Onboarding wizard

---

## 9. Riskler & Bilinen Sınırlamalar

| Risk | Açıklama | Önlem |
|------|----------|-------|
| Test eksikliği | Sıfır test, regresyon riski yüksek | #36 acil |
| Webhook güvenliği | Shopify HMAC kapalı | #16 |
| Tek migration dosyası | Schema değişiklik geçmişi yok | #40 |
| Job görünürlüğü | BullMQ var ama UI yok | #1 |
| Görsel yönetimi | URL listesi, CDN yok | #11 |
| Manuel onboarding | Yeni bayi/pazaryeri ekleme yorucu | #14, #30 |

---

## 10. Başarı Metrikleri (Önerilen)

- **Aktif bayi sayısı** ve aylık büyüme
- **Bağlı pazaryeri/bayi oranı** (ortalama kaç entegrasyon)
- **Sipariş senkron süresi** (webhook → DB → bayi paneli)
- **Stok tutarsızlık oranı** (master vs pazaryeri)
- **İlk sipariş süresi (TTFO)** — kayıt → ilk satış
- **Aylık fatura tahsilat oranı**
- **Sync hata oranı** (sync_logs üzerinden)

---

*Bu doküman canlı bir referanstır; her sprint sonu güncellenmesi önerilir.*

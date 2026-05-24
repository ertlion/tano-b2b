# Faz 1 — Kurulum & Doğrulama Rehberi

> Bu doküman, Faz 1'de yazılan kodu **çalışır hale getirmek** ve **doğru çalıştığını doğrulamak** için yapman gerekenleri sırayla anlatır.
> Tarih: 2026-05-24

İçindekiler:
1. Ön koşullar
2. Adım adım kurulum
3. Her özellik için doğrulama
4. Uçtan uca test senaryosu
5. Dikkat edilecekler / bilinen varsayımlar
6. Bende kalan eksikler

---

## 1. Ön Koşullar

| Gereksinim | Açıklama |
|-----------|----------|
| PostgreSQL | `DATABASE_URL` ile erişilebilir, çalışır durumda |
| Redis | `REDIS_URL` (BullMQ için; sipariş/sync kuyruğu) |
| ikas Private App | ateliertano.com mağazasında oluşturulmuş, API key + secret elde edilmiş |
| Node + bağımlılıklar | `npm install` yapılmış |

---

## 2. Adım Adım Kurulum

### Adım 1 — Veritabanı migration'ı uygula

Yeni tablo ve kolonlar `drizzle/0002_tano_toptan_faz1.sql` dosyasında. **Idempotent** (birden çok kez çalıştırılabilir).

```bash
# Proje kökünde:
psql "$DATABASE_URL" -f drizzle/0002_tano_toptan_faz1.sql
```

> Alternatif: `npx drizzle-kit push` (schema.ts'ten diff üretip uygular). İkisinden birini kullan, ikisini birden değil.

Bu migration şunları ekler:
- `orders` → `invoice_file_url`, `cargo_label_file_url`, `invoice_uploaded_at`, `stock_applied` kolonları + `status` varsayılanı `bekleniyor`
- Yeni tablo `tenant_variant_skus` (mağaza bazlı SKU/barkod)
- Yeni tablo `ikas_sync_state` (ikas sync cursor)

### Adım 2 — Ortam değişkenleri

`.env` dosyana ekle (örnek: `.env.example`):

```bash
# ikas Master (ateliertano Private App) — sistemin TEK master ürün/stok kaynağı
IKAS_MASTER_STORE_URL=ateliertano          # sadece subdomain ya da tam URL
IKAS_MASTER_API_KEY=<private_app_client_id>
IKAS_MASTER_API_SECRET=<private_app_client_secret>

# Cron/webhook koruması (zaten olmalı)
WEBHOOK_SECRET=<rastgele-uzun-string>
```

> `IKAS_MASTER_STORE_URL` "ateliertano" yazılırsa kod otomatik `https://ateliertano.myikas.com` yapar. Tam URL de verebilirsin.

### Adım 3 — ikas Private App ayarları (ikas paneli)

ateliertano.com ikas panelinde:
1. **Ayarlar → API / Uygulamalar → Private App oluştur**
2. İzinler (scopes): **ürün okuma**, **stok okuma**, (sipariş webhook'ları kullanılacaksa **sipariş okuma**)
3. `client_id` → `IKAS_MASTER_API_KEY`, `client_secret` → `IKAS_MASTER_API_SECRET`
4. **Webhook ekle (gerçek zamanlı stok için):**
   - URL: `https://<uygulama-domainin>/api/webhooks/ikas-master`
   - Event: stok güncelleme / ürün güncelleme

> Webhook olmasa bile cron reconciliation (Adım 5) stoğu periyodik düzeltir; webhook sadece gerçek zamanlılık sağlar.

### Adım 4 — İlk ürün/stok çekimi (master katalog)

Admin olarak giriş yap, sonra **tarayıcı konsolunda** (admin paneli açıkken) çalıştır:

```js
fetch('/api/admin/ikas-sync', { method: 'POST' })
  .then(r => r.json()).then(console.log)
```

Beklenen yanıt:
```json
{ "success": true, "data": { "productsUpserted": N, "variantsUpserted": M, "stockChanges": K, "errors": [] } }
```

> Not: Bu işlemi tetikleyecek **buton henüz admin panelde yok** (bkz. Bölüm 6). Şimdilik konsoldan / curl ile çağrılıyor.

### Adım 5 — Periyodik reconciliation cron'u kur

Stok kaçaklarını yakalamak için (örn. webhook düşerse). Coolify/cron ile her 10-15 dk:

```bash
curl "https://<domain>/api/cron/ikas-sync?secret=$WEBHOOK_SECRET"
```

---

## 3. Her Özellik İçin Doğrulama

### A) ikas Master Stok (Epic A)

**SQL doğrulama** — ürünler ikas'tan geldi mi:
```sql
SELECT count(*) FROM master_products WHERE source = 'ikas';
SELECT count(*) FROM master_variants WHERE external_id IS NOT NULL;
SELECT * FROM ikas_sync_state;                 -- last_full_sync görünmeli
SELECT * FROM sync_logs WHERE type = 'ikas_master_sync' ORDER BY created_at DESC LIMIT 3;
```

**Gerçek zamanlı stok testi:** ikas panelinde bir varyantın stoğunu değiştir → birkaç saniye içinde:
```sql
SELECT sku, stock_quantity, updated_at FROM master_variants WHERE external_id = '<ikas_variant_id>';
SELECT * FROM stock_movements WHERE type = 'ikas_sync' ORDER BY created_at DESC LIMIT 5;
```

### B) Mağaza Bazlı SKU/Barkod (Epic J)

Bir bayinin bir ürünü kendi mağazasına push etmesini sağla (panel → ürünler → aktar). Sonra:

```sql
SELECT tenant_id, master_variant_id, marketplace, store_sku, store_barcode, external_variant_id
FROM tenant_variant_skus ORDER BY id DESC LIMIT 20;
```

Doğrula:
- `store_sku` formatı: `TT-<tenantId>-<kanalKodu>-<varyantId>` (kanal: ikas=1, shopify=2, trendyol=3, tsoft=4, ideasoft=5)
- `store_barcode` 13 haneli (EAN-13)
- **Aynı master varyant farklı bayilerde push edilince farklı `store_sku`/`store_barcode` almalı** → pazaryerinde eşleşmezler
- Pazaryerinde (Shopify/ikas) ürünün SKU/barkodu bu store değeri olmalı (master SKU değil)

### C) Tek Havuz Stok (Epic B)

İki farklı bayinin aynı master üründen sattığını varsay. Bir bayiye sipariş düşür (gerçek ya da test webhook). Sonra:

```sql
-- Sipariş geldi, stok düştü mü, idempotency işaretlendi mi
SELECT id, status, stock_applied, external_order_id FROM orders ORDER BY id DESC LIMIT 5;
SELECT * FROM stock_movements WHERE type = 'order' ORDER BY created_at DESC LIMIT 5;

-- Master stok azaldı mı (tek havuz)
SELECT sku, stock_quantity FROM master_variants WHERE id = <variantId>;
```

Doğrula:
- Master stok **sipariş adedi kadar** azaldı
- `stock_applied = true`
- `sync_logs`'ta `stock_sync` kaydı var (diğer bayilere yayıldı)
- **Aynı siparişi tekrar gönderirsen** (aynı `external_order_id`) stok TEKRAR düşmemeli (idempotency)
- Overselling testi: stok 1 iken iki eşzamanlı sipariş → stok 0'da kalmalı, negatife düşmemeli

### D) Sipariş Akışı + Fatura/Etiket (Epic D)

**Üye tarafı:** Panel → Siparişler → bir siparişe gir →
- Sağ kolonda **"Fatura & Kargo Etiketi"** kartı görünür
- Fatura yükle → durum hâlâ `Bekleniyor` (tek belge)
- Kargo etiketi de yükle → durum **`Hazırlanacak`** olur

```sql
SELECT id, status, invoice_file_url IS NOT NULL AS fatura, cargo_label_file_url IS NOT NULL AS etiket, invoice_uploaded_at
FROM orders WHERE id = <orderId>;
SELECT * FROM order_status_history WHERE order_id = <orderId> ORDER BY created_at DESC;
```

**Admin tarafı:** Admin → Siparişler → ilgili sipariş →
- **"Üye Belgeleri"** kartında fatura + etiket görüntülenebilir
- "Durum Güncelle" ile `Hazırlanacak → Paketlendi → Gönderildi`
- Üye panelinde durum güncellenmiş görünmeli

Doğrula:
- Belge eksikken admin "Paketlendi" yaparsa? (Şu an engellenmiyor; sadece üye akışı belge bekliyor — bkz. Bölüm 5)
- Geçersiz geçiş denemesi (örn. `bekleniyor → gonderildi`) **400 hata** vermeli

**Kargo entegrasyonu pasif:** Panel → Ayarlar → "Kargo Ayarları" bölümü **görünmemeli**.

---

## 4. Uçtan Uca Test Senaryosu (Golden Path)

1. **Migration + env** tamam (Bölüm 2)
2. `POST /api/admin/ikas-sync` → master katalog dolu (`master_products.source='ikas'`)
3. Bir bayi ile giriş → bir ürünü kendi pazaryerine **push** → `tenant_variant_skus` satırı oluştu, pazaryerinde benzersiz SKU/barkod
4. O pazaryerinden o ürüne **sipariş** gelsin (webhook) → sipariş `bekleniyor`, master stok düştü, diğer bayilere yayıldı
5. Bayi siparişe **fatura + kargo etiketi** yükler → `hazirlanacak`
6. Admin siparişi **paketlendi → gönderildi** yapar → bayi panelinde güncellenir
7. ikas'ta stok değişir → webhook/cron → master + tüm kanallar güncellenir

Hepsi sorunsuzsa Faz 1 çalışıyor demektir.

---

## 5. Dikkat Edilecekler / Bilinen Varsayımlar

| Konu | Durum / Yapılması gereken |
|------|---------------------------|
| **ikas `listProduct` alan adları** | `stocks`, `variantValues`, `images` alanları ateliertano canlı mağazasına göre **doğrulanmalı**. Parsing savunmacı yazıldı ama yanlış alan adı = boş stok/varyant. İlk sync sonrası SQL ile kontrol et. |
| **Barkod kapasitesi** | `store_barcode` üretimi `tenantId < 10000` ve `masterVariantId < 1.000.000` varsayar. Aşılırsa kod hata fırlatır (push başarısız olur, sessiz hata değil). |
| **Pazaryeri barkod kabulü** | Bazı pazaryerleri (Trendyol vb.) kayıtlı GTIN ister. Ürettiğimiz EAN-13 geçerli formatta ama pazaryeri reddedebilir → push hatası gelirse barkod stratejisini gözden geçirmek gerekebilir. |
| **Eski push edilmiş ürünler** | Bu değişiklikten ÖNCE push edilenlerde `tenant_variant_skus` satırı yok; siparişleri eski SKU eşlemesiyle (master sku/barkod) çözülür (geri uyumlu). İstersen bunları yeniden push edip yeni SKU'ya geçirebilirsin. |
| **Belge zorunluluğu (admin)** | Admin, fatura/etiket eksik bir siparişi yine de elle "paketlendi" yapabilir — UI engellemiyor. İstenirse zorunlu kontrol eklenir. |
| **Bakiyesiz fatura yükleme izni** | Faz 2'ye bırakıldı (kod TODO ile işaretli). Şu an her üye yükleyebilir. |
| **Tarayıcı testi** | UI'yi DB + dev server ile gerçek ortamda test etmedim. `npm run dev` ile golden path'i bizzat görmen önerilir. |
| **Master store vs tenant store** | Master stok webhook'u → `/api/webhooks/ikas-master` (env ile). Bayi sipariş webhook'u → `/api/webhooks/ikas` (per-tenant ayar). Karıştırma. |

---

## 6. Bende Kalan Eksikler (istersen tamamlarım)

1. **Admin'de "ikas Senkronize Et" butonu** — şu an `/api/admin/ikas-sync` sadece API; admin sync sayfasına buton eklenebilir.
2. **Admin'de belge zorunluluğu kontrolü** — fatura/etiket yoksa "paketlendi" engellensin (opsiyonel iş kuralı).
3. **`next lint` tam taraması** — ilk derlemede çok yavaş çalıştı, sonuç alamadım. `tsc` temiz; lint'i ortamında bir kez çalıştırman iyi olur (`npm run lint`).
4. **Otomatik test** — stok atomikliği ve SKU üretimi için unit test yok (projede hiç test yok). Faz 1'in en riskli kısmı stok; en azından buna test önerilir.

---

## Hızlı Komut Özeti

```bash
# 1. Migration
psql "$DATABASE_URL" -f drizzle/0002_tano_toptan_faz1.sql

# 2. (env doldurduktan sonra) dev server
npm run dev

# 3. Master katalog çek (admin girişliyken, tarayıcı konsolu)
fetch('/api/admin/ikas-sync',{method:'POST'}).then(r=>r.json()).then(console.log)

# 4. Cron reconciliation (manuel test)
curl "http://localhost:3000/api/cron/ikas-sync?secret=$WEBHOOK_SECRET"
```

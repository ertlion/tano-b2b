# Tano Toptan — Revizyon Planı & Öncelik Listesi

> **Doküman tarihi:** 2026-05-24
> **Kapsam:** ikas master stok modeli, çok kanal sipariş çekme, manuel fatura/kargo akışı, bakiye/cüzdan sistemi, PayTR, AI görsel üretimi, defolu ürün bildirimi, Telegram bildirimleri
> **Karar notları:**
> - Görsel motoru: mevcut `gorsel-motoru` projesi → soyut "görsel sağlayıcı" arayüzü üzerinden bağlanacak (kod sonra verilecek)
> - Kargo entegrasyonu: kod **silinmeyecek**, UI'dan gizlenip pasif bırakılacak
> - ikas: **Özel (Private) App** — tek mağaza (ateliertano.com)
> - Bakiye sistemi: bu fazda **sadece bakiye + PayTR**; mevcut fatura/cari/Paraşüt modülüne dokunulmayacak (pasif kalabilir)

---

## 1. Yönetici Özeti

Mevcut sistem bayi başına ürün push + webhook ile sipariş alan bir B2B platformu. Bu revizyon, sistemi **ikas merkezli, tek master stok havuzu** üzerine kuran, **manuel fatura/kargo etiketi akışıyla** kargo entegrasyonunu ortadan kaldıran, ve **prepaid bakiye + AI görsel üretimi** ile gelir modelini değiştiren bir dönüşümdür.

**En kritik mimari değişiklikler:**
1. **Tek havuz stok modeli** — ateliertano.com (ikas) master stok kaynağı. Herhangi bir üyenin herhangi bir kanaldan aldığı sipariş, master stoğu düşürür ve bu düşüş **tüm üyelerin tüm bağlı kanallarına** yayılır.
2. **Sipariş çekme** — şu an siparişler yalnızca webhook'tan geliyor; adapter arayüzünde sipariş çekme metodu **yok**. Polling tabanlı kanallar (Trendyol, Ticimax) için `fetchOrders()` eklenecek.
3. **Sipariş akışı** — kargo API'leri yerine üyenin manuel fatura+etiket yüklemesi durumu yönetecek.
4. **Bakiye ekonomisi** — iki tip bakiye (ürün + AI görsel), PayTR ile yükleme, kullanıcı bazlı fiyatlandırma.

---

## 2. Mevcut Durum → Hedef Durum Farkı

| Alan | Mevcut | Hedef |
|------|--------|-------|
| Stok kaynağı | Master katalog (manuel/Excel/XML) | **ikas master stok (Private App)** |
| Stok modeli | Bayi bazlı push, sync log | **Tek havuz — sipariş herkesin stoğunu düşürür** |
| SKU/Barkod | Master tek SKU + tek barkod | **Mağaza bazlı benzersiz SKU + barkod** (kanallarda ürünler eşleşmesin) |
| Sipariş eşleme | — (webhook payload) | **Mağaza SKU'su → master varyant ters eşleme** |
| Sipariş alımı | Sadece webhook | Webhook **+ polling (`fetchOrders`)** |
| Pazaryerleri | shopify, ikas, trendyol, ideasoft, tsoft | **+ ticimax** |
| Kargo | 5 kargo API adapter (aktif) | **Pasif — manuel fatura/etiket yükleme** |
| Sipariş durumu | `new` → ... | **bekleniyor → hazırlanacak → paketlendi/gönderildi** |
| Ödeme/finans | Fatura + cari + Paraşüt | **Prepaid bakiye + PayTR** (cari pasif) |
| Görsel | URL listesi | **AI görsel üretimi + galeri yönetimi** |
| Defolu ürün | Yok | **Sipariş bazlı, 5 iş günü kuralı, admin talebi** |
| Bildirim | Email (SMTP) | Email **+ kullanıcı bazlı Telegram** |

---

## 3. Epic'ler ve Bağımlılıklar

```
Epic A: ikas Master Stok (Private App)  ──┐
                                          ├──► Epic B: Tek Havuz Stok Sync
Epic C: Marketplace Genişletme (Ticimax  ─┘         │
        + sipariş çekme fetchOrders)                ▼
                                          Epic D: Sipariş Akışı Revizyonu
                                                    (fatura/etiket, kargo pasif)
Epic E: Bakiye/Cüzdan Sistemi  ──┬──► Epic F: PayTR Entegrasyonu
                                 └──► Epic G: AI Görsel Üretimi (gorsel-motoru)
Epic H: Defolu Ürün Bildirimi   (Epic D'ye bağlı — sipariş gerekli)
Epic I: Telegram Bildirimleri   (cross-cutting — tüm epic'lere bildirim ekler)

Epic J: Mağaza Bazlı SKU/Barkod Eşleme  (FOUNDATION — push + sipariş eşleme + stok)
        └──► Epic B, C, D bu eşlemeye dayanır
```

**Kritik yol:** A → J → B → D, ve paralelde E → F/G.

---

## 4. Epic Detayları

### Epic A — ikas Master Stok Entegrasyonu (Private App)
**Amaç:** ateliertano.com ürün ve stoğunu sistemin tek doğruluk kaynağı (source of truth) yapmak.

- ikas Private App credential yapısı (`src/lib/marketplace/credential-resolver.ts` genişlet)
- ikas'tan ürün+varyant **içe çekme** → `master_products` / `master_variants` (`source = 'ikas'`, `external_id` eşleme)
- ikas **stok webhook**'u → master stok güncelleme (mevcut `api/webhooks/ikas` genişlet)
- Periyodik tam senkron (fallback): cron ile ikas stok reconciliation
- **Master katalog kaynağı: SADECE ikas** (bu faz için). XML/Excel import akışları pasife alınır — master ürünler yalnız ikas'tan gelir
- **Çıktı:** Master katalog ikas'a bağlı, stok her an güncel

**DB:** `master_products.source` zaten var. `xml_feeds` benzeri `ikas_sync_state` tablosu (son sync, cursor).

---

### Epic B — Tek Havuz Stok Senkronizasyonu
**Amaç:** "Sipariş geldiği gibi tüm stok değişiklikleri herkes için yapılacak" kuralı.

- Herhangi bir kanaldan sipariş düşünce → `master_variants.stockQuantity` atomik azalt → `stock_movements` ledger kaydı
- Master stok değişimi → **tüm bağlı tenant kanallarına** stok push (mevcut `sync-engine.ts` revize)
- **Concurrency/race koruması:** atomik decrement (DB-level `UPDATE ... SET stock = stock - n`), idempotency key (aynı sipariş iki kez işlenmesin)
- Stok 0 → tüm kanallarda otomatik delist/0 yazma
- **Çıktı:** Tek havuz, herkesin stoğu senkron

**Risk:** En riskli alan — eşzamanlı siparişlerde overselling. Atomik işlem + idempotency zorunlu.

---

### Epic C — Marketplace Genişletme + Sipariş Çekme
**Amaç:** Ticimax eklemek ve siparişleri kullanıcı bazında çekmek.

- **Ticimax adapter** (`src/lib/marketplace/adapters/ticimax.adapter.ts`)
  - `MarketplaceName` union'a `"ticimax"` ekle (`types.ts`)
  - `registry.ts`'e kaydet
- **Adapter arayüzüne `fetchOrders()` ekle** (yeni metod):
  ```ts
  fetchOrders(credentials, since?): Promise<NormalizedOrder[]>
  ```
  - Normalize sipariş: sipariş no, ürün adı, adet, renk/beden, müşteri (sabit alanlar)
  - **Kalem eşleme: gelen `store_sku`/`store_barcode` → master varyant** (Epic J eşleme tablosu)
- Polling cron: webhook'u olmayan/eksik kanallar için periyodik sipariş çekme
- Siparişler **kullanıcı (tenant) bazında** ilgili panele + admin'e düşer
- **Çıktı:** 6 kanaldan (ikas, shopify, ticimax, tsoft, ideasoft, trendyol) sipariş çekme

---

### Epic D — Sipariş Akışı Revizyonu (Kargo Pasif)
**Amaç:** Kargo entegrasyonu yerine manuel fatura/etiket akışı.

- **Yeni sipariş durum makinesi:**
  - `bekleniyor` → fatura+etiket yüklenmemiş (varsayılan)
  - `hazirlanacak` → üye fatura PDF/görsel + kargo etiketi PDF/görsel yükledi
  - `paketlendi` / `gonderildi` → admin Tano işleme aldı
- Üye panelinde sipariş detayında **dosya yükleme** (fatura + kargo etiketi)
- Admin panelinde "hazırlanacak" listesi → işleme al → durum güncelle
- Bakiye/izin kontrolü (Epic E ile): bakiyesi yoksa yükleme engellenebilir
- **Kargo kodunu pasifle:** `src/lib/cargo/*` kalsın, admin/panel UI'dan kargo butonları gizlensin
- **DB:** `orders` tablosuna `invoice_file_url`, `cargo_label_file_url`, `invoice_uploaded_at` ekle; status enum güncelle

---

### Epic J — Mağaza Bazlı SKU / Barkod Eşleme (FOUNDATION)
**Amaç:** Her mağazanın (tenant + kanal) ürünleri benzersiz SKU + barkod ile gitsin; pazaryerlerinde ürünler **birbirleriyle eşleşmesin** (buybox/ürün birleştirme engellensin). Siparişlerdeki Tano ürünleri bu mağaza bazlı SKU'dan yakalansın.

- **Push anında benzersiz SKU + barkod üretimi:** master varyant push edilirken o mağazaya özel benzersiz `store_sku` + `store_barcode` üretilir
  - Strateji: master SKU + tenant/kanal öneki/sonucu, ya da tamamen üretilmiş kod (deterministik & çakışmasız)
  - Barkod: mağaza bazlı benzersiz (GTIN benzeri ya da iç barkod havuzu)
- **Eşleme tablosu:** her `(tenant, master_variant, kanal)` için `store_sku` + `store_barcode` + `external_variant_id` saklanır
- **Sipariş ters eşleme:** webhook/`fetchOrders` ile gelen sipariş kaleminin SKU/barkodu → **master varyanta** çözülür → master stok düşer (Epic B)
- **Çakışma kontrolü:** üretilen SKU/barkod global benzersiz (DB unique constraint)
- **DB:** yeni `tenant_variant_skus` (tenantId, masterVariantId, marketplace, storeSku unique, storeBarcode unique, externalVariantId)
- **Etkilediği yerler:** push mantığı (mevcut), `MarketplaceProduct.variants[].sku/barcode` üretimi, sipariş ingest eşleme
- **Çıktı:** Her mağaza izole SKU/barkod; sipariş eşleme %100 deterministik

**Not:** Bu epic, Epic B (stok düşme) ve Epic C/D (sipariş eşleme) için ön koşuldur — sipariş geldiğinde "hangi master varyant?" sorusunun cevabı buradan gelir.

---

### Epic E — Bakiye / Cüzdan Sistemi
**Amaç:** İki tip prepaid bakiye + kullanıcı bazlı fiyatlandırma.

- **İki bakiye tipi:** `product` (ürün bakiyesi), `image` (AI görsel bakiyesi)
- Admin **manuel bakiye ekleme** (her iki tip)
- **Bakiye düşme kuralları:**
  - Her siparişte → ürün bakiyesi **üyenin toptan fiyatı** üzerinden düşer (sipariş kalemleri × toptan birim fiyat)
    - Toptan fiyat = `master_variants.salePrice` × (1 − `tenants.discountRate`) — kesin formül config'lenebilir
  - Her görsel üretiminde → görsel bakiyesi düşer (üretilen adet × kullanıcı birim fiyatı)
- **Kullanıcı bazlı görsel birim fiyatı** (admin belirler: X=50₺, Y=100₺)
- Bakiyeler arası **transfer** (opsiyonel, ikinci aşama)
- **İzin bayrağı:** bakiyesi yoksa fatura/etiket yükleyebilir mi? (kullanıcı bazlı admin ayarı)
- **DB:**
  - `balances` (tenantId, type, amount)
  - `balance_transactions` (ledger: tenantId, type, amount, direction, reason, refId)
  - `tenants` → `image_unit_price`, `allow_action_without_balance`
- **Risk:** Bakiye düşme atomik olmalı (negatife düşmesin); ledger ile audit

---

### Epic F — PayTR Entegrasyonu
**Amaç:** Bakiye yükleme ödemesi.

- PayTR iframe/token API (hash doğrulama — **güvenlik kritik**)
- Yükleme akışı: tutar + bakiye tipi seç (ürün / görsel) → PayTR → callback → bakiye yükle
- Ödeme callback idempotency (aynı ödeme iki kez yüklenmesin)
- **DB:** `payments` mevcut; PayTR'a özel `paytr_merchant_oid`, `provider` alanları
- **Çıktı:** Üye self-servis bakiye yükleme

---

### Epic G — AI Görsel Üretimi (gorsel-motoru entegrasyonu)
**Amaç:** Ürün görseli üretimi + galeri yönetimi.

- **Akış:** Ürün detayı → görselleri seç → "Yeni görsel oluştur" → mekan özellikleri → manken özellikleri → açı seçimi → üret
- **Kaynak motor:** `/Users/ertugrul.aslan/Downloads/gorsel-motoru-main` — Gemini (`gemini-3-pro-image-preview`) tabanlı moda görsel üreticisi.

**Entegrasyon kararı (sağlıklı & sade):** Motoru ayrı servis ya da client-side olarak değil, **tano-b2b içine server-side bir modül** olarak port et. Gerekçeler:
- **Güvenlik (zorunlu):** Bakiye düşümü server-authoritative olmalı. Orijinal motor Gemini'yi tarayıcıdan `?key=` ile çağırıyor — bu modelde API key sızar ve kullanıcı bakiyeyi bypass edip doğrudan üretim yapabilir. Paralı bakiye sistemi için **Gemini çağrısı sunucuda** olmalı, key asla istemciye gitmez.
- **Sadelik:** Tek codebase, tek deploy. Ayrı microservice'in client-side mimaride temiz HTTP API'si yok.

**Yapılacaklar:**
- **Yeniden kullan (port):** `src/data/*` preset verileri (200 arka plan = mekan, outfits/poses = manken, lensEffects = açı, lighting, weather) → tano-b2b'de seçim UI'sini besler. Prompt-üretim fonksiyonları (`buildProductAnalysisPrompt`, vb.) sunucuya taşınır.
- **Değiştir:** Tarayıcıya bağımlı canvas işlemleri (resize, yüz maskeleme) → sunucuda `sharp` ile yeniden yazılır.
- **Soyut `ImageProvider` arayüzü:** `generate(productImages, sceneParams, modelParams, angle, count)` → ileride motor değişse de UI sabit kalır.
- **Gemini key havuzu** server env'de (rotation mantığı `gemini.js`'ten alınır).
- Üretilen adet × kullanıcı birim fiyatı → görsel bakiyesinden düş (**üretim öncesi atomik rezervasyon**, başarısız üretimde iade).
- **Galeri:** üretilen görselleri görme, silme, **sıralama** (drag & drop), satış kanallarına gönderme.
- **DB:**
  - `ai_image_jobs` (tenantId, masterProductId, params, status, cost, count)
  - `generated_images` (jobId, url, sort_order, is_active)
- **Bağımlılık:** Epic E (bakiye) + preset/prompt port
- **Çıktı:** Bakiyeli, server-güvenli AI görsel üretim hattı

> **Not:** Görsel üretimi uzun sürebilir → BullMQ kuyruğu (mevcut altyapı) ile async job + ilerleme bildirimi (Telegram/UI).

---

### Epic H — Defolu Ürün Bildirimi
**Amaç:** Sipariş bazlı defolu ürün talebi.

- Üye **kendi siparişlerinden** seçer
- **5 iş günü kuralı:** sipariş tarihinden 5 iş günü geçtiyse → işlem kapalı (Türkiye resmi tatil takvimi dikkate alınmalı)
- 5 iş günü geçmediyse → görsel + açıklama yükle → admin talebi oluştur
- Admin onay/red/aksiyon → üyeye bildirim (Telegram/email)
- **DB:** `defect_reports` (tenantId, orderId, images, description, status, adminNote)

---

### Epic I — Telegram Bildirimleri
**Amaç:** Kullanıcı bazlı Telegram bildirimi.

- **Tek bot, çok kullanıcı:** Tek Tano bot'u kurulur; her üye kendi Telegram hesabıyla eşleşir.
- **Eşleme (zorunlu):** Telegram kullanıcı adından **doğrudan mesaj atılamaz**. Üye ayarlardan username girer + bot'a `/start <eşleme-kodu>` ile deep-link üzerinden bağlanır → `telegram_chat_id` kaydedilir. Bot'u başlatmayan üyeye mesaj gitmez.
- **Bildirim kapsamı (✅ onaylandı: her ikisi + tercih):**
  - **Otomatik olaylar:** yeni sipariş düştü, defolu talep dönüşü, düşük bakiye uyarısı, görsel üretimi hazır
  - **Admin manuel hatırlatma:** admin panelinden seçili üye(ler)e serbest mesaj
  - Üye bazlı **bildirim tercihi** (hangi olayları istesin) — aç/kapa
- **DB:** `tenants` → `telegram_username`, `telegram_chat_id`, `telegram_prefs` (json)

---

## 5. Öncelik Listesi (P0 → P3)

| # | İş | Epic | Öncelik | Bağımlılık | Tahmini Efor |
|---|----|----|---------|-----------|--------------|
| 1 | ikas Private App + ürün/stok içe çekme | A | **P0** | — | Yüksek |
| 1b | Mağaza bazlı SKU/barkod üretimi + eşleme tablosu | J | **P0** | — | Orta-Yüksek |
| 1c | Push'ta benzersiz SKU/barkod atama (kanallarda eşleşmesin) | J | **P0** | 1b | Orta |
| 2 | Tek havuz stok sync + atomik decrement + idempotency | B | **P0** | A, J | Yüksek |
| 2b | Sipariş kalemi ters eşleme (store SKU → master varyant) | J/C | **P0** | 1b | Orta |
| 3 | Sipariş durum makinesi (bekleniyor/hazırlanacak/gönderildi) | D | **P0** | — | Orta |
| 4 | Manuel fatura + kargo etiketi yükleme (üye & admin akışı) | D | **P0** | 3 | Orta |
| 5 | Kargo entegrasyonunu UI'dan gizle (pasif) | D | **P1** | — | Düşük |
| 6 | Bakiye sistemi (2 tip + ledger + admin manuel ekleme) | E | **P0** | — | Yüksek |
| 7 | Kullanıcı bazlı görsel fiyatı + bakiye düşme kuralları | E | **P1** | 6 | Orta |
| 8 | Bakiyesiz fatura yükleme izni (kullanıcı bazlı ayar) | E | **P1** | 4, 6 | Düşük |
| 9 | PayTR bakiye yükleme (hash + callback idempotency) | F | **P0** | 6 | Orta-Yüksek |
| 10 | `fetchOrders()` adapter metodu + polling cron | C | **P1** | — | Orta |
| 11 | Ticimax adapter | C | **P1** | 10 | Orta |
| 12 | AI görsel sağlayıcı soyut arayüzü | G | **P1** | — | Düşük |
| 13 | AI görsel üretim akışı (mekan/manken/açı) + bakiye düşme | G | **P1** | 6, 12, kod teslimi | Yüksek |
| 14 | Görsel galerisi (sil/sırala/kanala gönder) | G | **P2** | 13 | Orta |
| 15 | Defolu ürün bildirimi (5 iş günü kuralı) | H | **P2** | 4 | Orta |
| 16 | Telegram chat_id eşleme + bildirim servisi | I | **P2** | — | Orta |
| 17 | Bakiyeler arası transfer | E | **P3** | 6 | Düşük |
| 18 | Bildirim olaylarını tüm epic'lere bağlama | I | **P3** | 16 | Düşük |

---

## 6. Önerilen Faz Planı

### Faz 1 — Çekirdek Stok & Sipariş (P0)
> Sistemin yeni temeli. Bunlar olmadan diğerleri anlamsız.
- #1 ikas Private App + master stok
- #1b/#1c Mağaza bazlı SKU/barkod üretimi + push entegrasyonu
- #2 Tek havuz stok sync (atomik + idempotent)
- #2b Sipariş kalemi ters eşleme (store SKU → master varyant)
- #3 Sipariş durum makinesi
- #4 Manuel fatura/etiket yükleme akışı

### Faz 2 — Bakiye Ekonomisi (P0/P1)
- #6 Bakiye sistemi + ledger
- #9 PayTR yükleme
- #7 Kullanıcı bazlı fiyat + düşme kuralları
- #8 Bakiyesiz yükleme izni
- #5 Kargo UI gizleme

### Faz 3 — Kanal Genişleme & AI Görsel (P1)
- #10 `fetchOrders()` + polling
- #11 Ticimax adapter
- #12 + #13 AI görsel sağlayıcı + üretim akışı (gorsel-motoru teslimi sonrası)

### Faz 4 — Tamamlayıcılar (P2/P3)
- #14 Görsel galerisi
- #15 Defolu ürün bildirimi
- #16 + #18 Telegram bildirimleri
- #17 Bakiye transferi

---

## 7. Veritabanı Değişiklikleri (Toplu Özet)

**Yeni tablolar:**
- `balances` — tenant başına ürün/görsel bakiyesi
- `balance_transactions` — bakiye hareket ledger'ı
- `ai_image_jobs` — görsel üretim işleri
- `generated_images` — üretilen görseller (sıralama, aktiflik)
- `defect_reports` — defolu ürün talepleri
- `ikas_sync_state` — ikas master sync durumu
- `tenant_variant_skus` — mağaza bazlı SKU/barkod eşleme (storeSku/storeBarcode unique, externalVariantId)

**Değişen tablolar:**
- `tenants` → `telegram_username`, `telegram_chat_id`, `image_unit_price`, `allow_action_without_balance`
- `orders` → `invoice_file_url`, `cargo_label_file_url`, `invoice_uploaded_at`, status enum güncelle
- `master_products` / `master_variants` → ikas `source`/`external_id` (mevcut, doğrula)

**Migration disiplini:** Şu an tek `0001_xml_integration.sql` var. Her epic için ayrı idempotent migration (`0002_*`, `0003_*` ...) yazılmalı.

---

## 8. Kritik Riskler

| Risk | Açıklama | Önlem |
|------|----------|-------|
| **Overselling** | Eşzamanlı siparişlerde tek havuz stok negatife düşebilir | Atomik DB decrement + idempotency key (Epic B) |
| **SKU çakışması** | Üretilen mağaza SKU/barkodu çakışırsa sipariş yanlış eşlenir | Global unique constraint + deterministik üretim (Epic J) |
| **Eşleşmeyen sipariş** | Gelen SKU eşleme tablosunda yoksa stok düşmez | Eşleşmeyenler "manuel inceleme" kuyruğuna + admin uyarısı |
| **ikas tek nokta** | ikas down olursa tüm stok durur | Periyodik reconciliation + cache fallback |
| **PayTR güvenliği** | Hash/callback manipülasyonu | Resmi hash doğrulama + callback idempotency |
| **Telegram DM** | Username'den direkt mesaj atılamaz | `/start` deep-link ile chat_id eşleme |
| **AI maliyet** | Görsel üretimi maliyetli, bakiye senkron olmazsa zarar | Üretim öncesi atomik bakiye rezervasyonu |
| **5 iş günü hesabı** | Resmi tatiller hesaba katılmazsa yanlış kapanma | Türkiye tatil takvimi tablosu |
| **Test eksikliği** | Mevcut sıfır test; stok mantığı kritik | En azından Epic B için unit/integration test |

---

## 9. Açık Sorular

**Netleşenler (2026-05-24):**
- ✅ **Ürün bakiyesi düşüşü:** üyenin **toptan fiyatı** üzerinden (formül config'lenebilir, bkz. Epic E)
- ✅ **Master katalog:** bu faz için **sadece ikas** (XML/Excel pasif, bkz. Epic A)
- ✅ **gorsel-motoru:** ayrı servis/client değil, **server-side modül olarak tano-b2b'ye port** (güvenlik + sadelik, bkz. Epic G)

**Hâlâ netleşecek:**
1. **AI görsel:** mekan/manken özellikleri sabit liste mi (gorsel-motoru preset'leri) yoksa serbest metin de olacak mı? Hangi açı seçenekleri sunulacak?
2. **Telegram bildirim kapsamı:** her siparişte mi, sadece admin hatırlatmasında mı, yoksa ikisi + kullanıcı tercihi mi? (öneri için aşağıya bkz.)
3. **Sipariş çekme sıklığı:** polling aralığı kaç dakika? Webhook olan kanallar polling'den muaf mı?
4. **Toptan fiyat formülü:** `salePrice × (1 − discountRate)` doğru mu, yoksa varyant başı ayrı toptan fiyat alanı mı gerekli?

---

*Plan onaylandıktan / açık sorular netleştikten sonra Faz 1'den başlanması önerilir.*

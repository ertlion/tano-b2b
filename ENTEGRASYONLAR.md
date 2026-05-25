# Tano Toptan — Entegrasyon Kurulum Rehberi

> Tüm entegrasyon ayarları **Admin → Entegrasyonlar** ekranından girilir (DB `app_config`).
> Kod önce DB'den okur, boşsa env değişkenine düşer. Gizli alanlar maskelidir; boş bıraktığın alan mevcut değeri korur.
> Tarih: 2026-05-25

İçindekiler:
1. ikas Master (ürün/stok/fiyat/görsel kaynağı)
2. ikas OAuth (bayi mağaza bağlama)
3. Pazaryerleri (Shopify / ikas / Trendyol / T-Soft / IdeaSoft) — bayi bazlı
4. PayTR (bakiye yükleme)
5. Gemini (AI görsel)
6. S3 / Object Storage (görsel depolama)
7. Telegram (bildirimler)
8. USD kuru & Dolar B2B fiyat listesi
9. Kargo (pasif)
10. Webhook adresleri özeti

---

## 1. ikas Master — ürün/stok/fiyat/görsel kaynağı
**Ne işe yarar:** Sistemin TEK master kataloğu. ateliertano ikas mağazasından ürün, varyant, stok, fiyat ve görselleri çeker.

**ikas tarafı:** ateliertano ikas panel → Ayarlar → API/Uygulamalar → **Private App** oluştur. İzinler: ürün okuma, stok okuma. `client_id` + `client_secret` al.

**Admin → Entegrasyonlar → "ikas Master":**
| Alan | Açıklama | config key |
|------|----------|-----------|
| Mağaza | `ateliertano` (subdomain) | `ikas_master_store_url` |
| API Key | Private App client_id | `ikas_master_api_key` |
| API Secret | Private App secret | `ikas_master_api_secret` |
| Access Token | (opsiyonel, OAuth ile alındıysa) | `ikas_master_access_token` |
| Dolar B2B Fiyat Listesi ID | `e8cf9a61-ac0e-495a-9d9e-8be79a6ece94` | `ikas_b2b_price_list_id` |

**Nasıl çalışır:**
- Kimlik: `client_credentials` ile token (`https://ateliertano.myikas.com/api/admin/oauth/token`), GraphQL `https://api.myikas.com/api/v1/admin/graphql`.
- **Otomatik senkron: her 3 dakikada bir** (sunucu içi zamanlayıcı). Ürün ekler/günceller, stok/fiyat/görsel tazeler, ikas'ta **silinen** ürünü `passive` yapar (stok 0 → kanallardan düşer).
- Görsel URL formatı: `https://cdn.myikas.com/images/{merchantId}/{imageId}/image_1080.webp` (merchantId `getMerchant.id`).
- Manuel: **Admin → Mağaza Sync → "Şimdi Senkronize Et"**.
- Gerçek zamanlı stok (opsiyonel): ikas Private App webhook'unu `https://ticaretofisi.com/api/webhooks/ikas-master` adresine bağla.

---

## 2. ikas OAuth — bayi mağaza bağlama (tenant onboarding)
**Ne işe yarar:** Bir bayinin KENDİ ikas mağazasını sisteme bağlaması (authorize → callback → token). Master'dan farklıdır.

**ikas tarafı:** Public/Sales-channel app. Yönlendirme (redirect) adresi: `https://ticaretofisi.com/api/auth/ikas/callback`.

**Admin → Entegrasyonlar → "ikas OAuth (Bayi)":**
| Alan | config key |
|------|-----------|
| Client ID | `ikas_app_client_id` |
| Client Secret | `ikas_app_client_secret` |

**Akış:** Bayi `…/api/auth/ikas/authorize?store=<mağaza>` → ikas onay → callback `authorization_code` → token bayinin `settings`'ine kaydedilir.

---

## 3. Pazaryerleri (Shopify / ikas / Trendyol / T-Soft / IdeaSoft) — BAYİ BAZLI
**Ne işe yarar:** Her bayinin ürünleri kendi satış kanalına push'laması + siparişlerin çekilmesi. Bunlar **global değil, bayi bazlıdır** (her bayi kendi mağaza credential'ını girer).

**Nerede:** Bayi panelinde → **Ayarlar** (panel/settings) → ilgili pazaryeri credential'ları (her bayi kendi `settings` kaydına yazar). Admin de bayi detayından girebilir.

**Push:** Bayi "Yeni Ürünler"den ürün seçip aktarır → her ürüne **benzersiz store SKU + barkod** üretilir (pazaryerlerinde ürünler birbiriyle eşleşmesin diye).

**Sipariş:** Pazaryeri webhook'larıyla gelir → ilgili bayiye + admin'e düşer, master stok düşer (tek havuz), ürün bakiyesi düşer.

> Not: **Ticimax** henüz yok (Ticimax mağaza API erişimi gerekiyor).

---

## 4. PayTR — bakiye yükleme
**Ne işe yarar:** Üyeler PayTR ile ürün/AI görsel bakiyesi yükler.

**Admin → Entegrasyonlar → "PayTR":**
| Alan | config key |
|------|-----------|
| Merchant ID | `paytr_merchant_id` |
| Merchant Key | `paytr_merchant_key` |
| Merchant Salt | `paytr_merchant_salt` |
| Test Modu (1/0) | `paytr_test_mode` |

**Nasıl çalışır:** Üye → Bakiyem → "Bakiye Yükle" → tip+tutar → token alınır (`get-token`, HMAC-SHA256) → PayTR iframe → ödeme → callback `https://ticaretofisi.com/api/webhooks/paytr` (hash doğrulanır) → bakiye eklenir (idempotent). Callback adresi otomatik gönderilir, ayrıca ayar gerekmez.

---

## 5. Gemini — AI görsel üretimi
**Ne işe yarar:** Ürün görselinden mekan/manken/açı seçerek yeni görsel üretir.

**Admin → Entegrasyonlar → "AI Görsel (Gemini)":**
| Alan | config key |
|------|-----------|
| API Key | `gemini_api_key` |
| Model | `gemini_image_model` (varsayılan `gemini-3-pro-image-preview`) |

**Nasıl çalışır:** Üye → AI Görsel → kaynak görsel + seçimler → `generateContent` (key SUNUCUDA, istemciye gitmez) → üretilen görsel S3'e yüklenir → galeri. Görsel bakiyesinden düşer (`image_unit_price × adet`), başarısızsa iade. **S3 ayarı da zorunlu** (yoksa 503).

---

## 6. S3 / Object Storage — görsel depolama
**Ne işe yarar:** Üretilen AI görselleri kalıcı saklar (R2 / MinIO / AWS S3 uyumlu). Bağımlılıksız native SigV4 ile.

**Admin → Entegrasyonlar → "Görsel Depolama (S3)":**
| Alan | Açıklama | config key |
|------|----------|-----------|
| Endpoint | R2/MinIO için (S3 ise boş) | `s3_endpoint` |
| Region | S3 / `auto` (R2) | `s3_region` |
| Bucket | | `s3_bucket` |
| Access Key | | `s3_access_key` |
| Secret Key | | `s3_secret_key` |
| Public URL | CDN / bucket public base | `s3_public_url` |

**Örnek (Cloudflare R2):** endpoint `https://<acc>.r2.cloudflarestorage.com`, region `auto`, public URL R2 public bucket adresi.

---

## 7. Telegram — bildirimler
**Ne işe yarar:** Üyeye yeni sipariş, defolu talep sonucu vb. bildirimi.

**Telegram tarafı:** @BotFather'dan bot oluştur → token al → bot kullanıcı adını not et. Webhook'u kur:
`https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://ticaretofisi.com/api/webhooks/telegram`

**Admin → Entegrasyonlar → "Telegram":**
| Alan | config key |
|------|-----------|
| Bot Token | `telegram_bot_token` |
| Bot Kullanıcı Adı (@'siz) | `telegram_bot_username` |

**Eşleme:** Üye → Telegram sayfası → "Bağlan" (deep-link `t.me/<bot>?start=<kod>`) → bot `/start <kod>` → `chat_id` kaydedilir. Username'den direkt mesaj atılamaz, bu eşleme şarttır. Üye bildirim tercihlerini açıp kapatabilir.

---

## 8. USD Kuru & Dolar B2B
- **USD→TL kuru:** Admin → **Ayarlar → Dolar Kuru** (config `usd_try_rate`, varsayılan 45.5). Tüm TL fiyatların temeli.
- TL fiyat = `usd_price × kur`; üye kendi marjını (% veya manuel TL) uygular.

---

## 9. Kargo — PASİF
Kargo entegrasyonu kaldırıldı. Üye siparişe **fatura + kargo etiketi** (PDF/görsel) yükler; admin işleme alır. Kod duruyor ama UI gizli.

---

## 10. Webhook adresleri özeti
| Entegrasyon | URL | Kurulum |
|-------------|-----|---------|
| ikas master stok | `…/api/webhooks/ikas-master` | ikas Private App'te elle (opsiyonel; cron yedekliyor) |
| Pazaryeri siparişleri | `…/api/webhooks/{shopify,ikas,ideasoft,tsoft}` | Pazaryerinde (Shopify otomatik kaydolur) |
| PayTR | `…/api/webhooks/paytr` | Otomatik (token isteğinde gönderilir) |
| Telegram | `…/api/webhooks/telegram` | `setWebhook` ile elle |

---

## Özet sıra (sıfırdan kurulum)
1. **Admin → Ayarlar → Dolar Kuru** gir
2. **Admin → Entegrasyonlar:** ikas Master + (gerekirse) ikas OAuth, PayTR, Gemini, S3, Telegram
3. Telegram + ikas master webhook'larını kur (yukarıdaki tablo)
4. **Admin → Müşteriler:** her bayiye ürün izni + bakiye + görsel birim fiyatı
5. Bayi kendi pazaryeri credential'ını panel/Ayarlar'dan girer → ürün push'lar

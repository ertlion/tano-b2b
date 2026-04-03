# Codebase Report: External Integration Patterns Research
Generated: 2026-04-03

## Summary

4 GitHub repo incelendi: Trendyol (trendyol-shopify + integration-sdk), IdeaSoft (.NET client), Ticimax (PHP SOAP). Tano-b2b'de halihazırda Shopify, ikas, TSoft, IdeaSoft adapter'ları mevcut. Bu araştırma Trendyol ve Ticimax eklemek için gereken pattern'leri ortaya koydu.

---

## Repo 1: ibidi/trendyol-shopify

**Ne yapar:** Shopify - Trendyol senkronizasyonu için React frontend projesi (README only, kaynak kod henüz yok).

**Auth:** `SHOPIFY_API_KEY` + `TRENDYOL_API_KEY` env vars ile Basic Auth

**Notlar:** Sadece README var, kod commit edilmemiş ("YAKINDA" notu var). Buradan kullanılabilecek gerçek implementasyon yok.

**Tano-b2b için değer:** Düşük. Kaynak kod yok.

---

## Repo 2: Turkmen87ai/IdeaSoftApiIntegration (.NET C#)

**Ne yapar:** IdeaSoft e-ticaret platformu için HTTP Basic Auth kullanan C# SDK.

### Auth
```
Authorization: Basic base64(ApiKey:ApiSecret)
BaseUrl: https://{store-slug}.myideasoft.com
```

### Key Endpoints
```
GET    /api/products?page={n}&per_page={n}
GET    /api/products/{id}?includes=variants,categories
POST   /api/products
PUT    /api/products/{id}
DELETE /api/products/{id}

GET    /api/orders?page={n}&per_page={n}&status={status}&customer_id={id}
PUT    /api/orders/{id}  (status update)

GET    /api/categories?page={n}&per_page={n}
GET    /api/categories/{id}/attributes
GET    /api/brands
GET    /api/brands?name={query}
```

### Response Format
```json
{
  "success": true,
  "data": [...],
  "message": null
}
// Paged:
{
  "success": true,
  "data": [...],
  "total": 150,
  "page": 1
}
```

### Order Status Values
`new`, `pending`, `completed` (status filter parametresi olarak geçiliyor)

### Tano-b2b için değer
**YÜKSEK.** Tano-b2b'deki mevcut IdeaSoft adapter'ı Bearer token kullanıyor (`Authorization: Bearer {token}`). Bu repo ise HTTP Basic Auth (`ApiKey:ApiSecret`) kullanıyor. IdeaSoft'un iki auth yöntemi desteklediği anlaşılıyor:
- OAuth Bearer token (tano-b2b mevcut): `ideasoft_access_token`
- HTTP Basic (bu repo): `api_key:api_secret`

Tano-b2b'de order çekme henüz implemente edilmemiş görünüyor - bu repo'nun `GetByStatusAsync` + `GetByCustomerAsync` pattern'leri referans alınabilir.

---

## Repo 3: Hasokeyk/ticimax-php (PHP SOAP)

**Ne yapar:** Ticimax e-ticaret platformu için PHP SOAP client kütüphanesi.

### Auth
```
domain: https://{magaza-domain}.ticimax.cloud  (veya özel domain)
key: UyeKodu (API key)
```
Her SOAP çağrısında `UyeKodu` parametresi gönderilir, ayrı auth endpoint yok.

### WSDL Endpoints
```
UrunServis:    /Servis/UrunServis.cvc?singleWsdl
SiparisServis: /Servis/SiparisServis.cvc?singleWsdl
```

### Key SOAP Methods

**Ürün:**
```
SelectUrun(UyeKodu, f: filtre, s: sayfalama)
  filtre: { Aktif, Firsat, Indirimli, Vitrin, KategoriID, MarkaID, UrunKartiID }
  sayfalama: { BaslangicIndex, KayitSayisi, SiralamaDegeri, SiralamaYonu }

SelectUrunCount(UyeKodu, f: filtre)

SaveUrun(UyeKodu, urunKartlari, ukAyar, vAyar)
  → yeni ürün oluştur / güncelle

UrunKartiGuncelle(UyeKodu, urunKarti, urunKartiAyar)
  → mevcut ürün ana bilgilerini güncelle

VaryasyonGuncelle(UyeKodu, urun, ayar)
  → varyasyon (beden/renk) güncelle
```

**Sipariş:**
```
SelectSiparis(UyeKodu, f: filtre, s: sayfalama)
  filtre: {
    EntegrasyonAktarildi: -1,  // -1 = tümü
    SiparisDurumu: -1,          // -1 = tümü
    OdemeTipi: -1,
    OdemeDurumu: -1,
    SiparisKaynagi: "",
    SiparisID: -1,
    SiparisNo: "",
    IptalEdilmisUrunler: true
  }
  sayfalama: { BaslangicIndex, KayitSayisi, SiralamaDegeri, SiralamaYonu }

SetSiparisDurum(UyeKodu, request: { Durum, KargoTakipNo, MailBilgilendir, SiparisID })
  Durum: 'KargoyaVerildi'

SetSiparisKargoyaVerildi(UyeKodu, SiparisId)
```

**Kategori / Marka:**
```
SelectKategori(UyeKodu, kategoriID: 0)
SelectMarka(UyeKodu, markaID: 0)
SelectTedarikci(UyeKodu, tedarikciID: 0)
SelectTeknikDetayOzellik(UyeKodu, teknikDetayOzellikId: 0, dil: "")
SelectTeknikDetayDeger(UyeKodu, teknikDetayDegerId: 0, dil: "")
```

### Ürün Modeli (key fields)
TicimaxProductModel üzerinden: ID, Ad, StokKodu, Fiyat, KDVOrani, KategoriID, MarkaID, Aktif, varyasyonlar ayrı model.

### Tek Kayıt Dönen API Sorunu
Ticimax SOAP API tek kayıt döndüğünde array yerine doğrudan obje döndürüyor. Kütüphane bunu şu pattern ile çözüyor:
```php
isset($response->...->ID)
  ? [$response->...->ID]   // tek kayıt → array'e al
  : ($response->... ?? null)  // zaten array
```

### Tano-b2b için değer
**YÜKSEK.** Ticimax'ın REST değil **SOAP** tabanlı olması kritik bilgi. Tano-b2b'de TypeScript ile Ticimax adapter yazılacaksa:
- `node-soap` paketi gerekir
- Her servis için ayrı WSDL URL'si kullanılır
- Her istek UyeKodu parametresi taşır
- Tek kayıt / çok kayıt tutarsızlığı handle edilmeli

---

## Repo 4: 24bulut/integration-sdk (PHP, multi-platform)

**Ne yapar:** Trendyol, Ticimax, Hepsiburada, N11, GittiGidiyor, ÇiçekSepeti için PHP entegrasyon SDK'sı.

### Trendyol Auth (en kritik)
```php
// Basic Auth: supplierId + API key/secret
Authorization: Basic base64(username:password)
User-Agent: {supplierId} - SelfIntegration  // ZORUNLU header
```

### Trendyol Key Endpoints
```
# Base: https://api.trendyol.com/sapigw/suppliers/{supplierId}/

GET    .../orders?page=0&status={}&size=200&startDate={unix}&endDate={unix}&orderByField=CreatedDate&orderByDirection=DESC
GET    .../orders?orderNumber={orderNumber}
GET    .../claims?claimItemStatus=Accepted&size={}&page=0   # İadeler

POST   .../v2/products          # Ürün ekle
PUT    .../v2/products          # Ürün güncelle
POST   .../products/price-and-inventory  # Stok + fiyat güncelle (AYRI ENDPOINT)

PUT    .../shipment-packages/{id}        # Paket durumu güncelle
PUT    .../shipment-packages/{id}/alternative-delivery  # Dijital teslimat
PUT    .../{shipmentPackageId}/update-tracking-number

GET    .../products/batch-requests/{batchRequestId}  # Async işlem log

# Global (supplierId gerektirmez):
GET    https://api.trendyol.com/sapigw/product-categories
GET    https://api.trendyol.com/sapigw/product-categories/{categoryCode}/attributes
GET    https://api.trendyol.com/sapigw/brands?size=15&page=1
GET    https://api.trendyol.com/sapigw/brands/by-name?name={name}
GET    https://api.trendyol.com/sapigw/shipment-providers
GET    https://api.trendyol.com/sapigw/suppliers/{id}/questions/filter?startDate={ms}&endDate={ms}&size=50
```

### Trendyol Kritik Detaylar
1. **Tarihler:** Order sorgusunda `startDate/endDate` Unix timestamp (saniye), soru sorgusunda **milisaniye**
2. **Async işlem:** Ürün push/update batch request döner → `batchRequestId` ile log sorgulanır
3. **Stok/fiyat ayrı endpoint:** `/products/price-and-inventory` - ürün update'den ayrı
4. **Durum akışı:** Paket güncelleme sırası: `Picking` → `Invoiced` (params: invoiceNumber) → `Shipped`
5. **Max order size:** 200 per page, max 2 haftalık tarih aralığı

### Trendyol Paket Durumları
`Created`, `Picking`, `Invoiced`, `Shipped`, `Cancelled`, `Delivered`, `UnDelivered`, `Returned`, `Repack`, `UnSupplied`

### Hepsiburada (bonus - bu SDK'dan)
Auth: iki katman:
1. `POST https://mpop.hepsiburada.com/api/authenticate` → `id_token` al (JWT Bearer)
2. Ürün işlemleri: Bearer token
3. Order/stok işlemleri: Basic Auth (ayrı subdomain: `oms-external`, `listing-external`)

---

## Tano-b2b için Öneriler

### Trendyol Adapter Eklenirse

tano-b2b'nin mevcut `MarketplaceAdapter` interface'i zaten async (`isAsync: boolean`) destekliyor. Trendyol async olduğu için:

```typescript
// Gereken credentials
interface TrendyolCredentials extends MarketplaceCredentials {
  marketplace: "trendyol";
  trendyol_supplier_id: string;
  trendyol_api_key: string;      // username
  trendyol_api_secret: string;   // password
}

// Auth header builder
const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
headers: {
  'Authorization': `Basic ${auth}`,
  'User-Agent': `${supplierId} - SelfIntegration`,
  'Content-Type': 'application/json'
}

// pushProduct isAsync = true döner, asyncTrackingId = batchRequestId
// ayrıca checkAsyncResult(trackingId) metodu gerekir
```

### Ticimax Adapter Eklenirse

SOAP tabanlı, `node-soap` paketi gerekir:

```typescript
// Gereken credentials
interface TicimaxCredentials extends MarketplaceCredentials {
  marketplace: "ticimax";
  ticimax_domain: string;    // https://magaza.ticimax.cloud
  ticimax_api_key: string;   // UyeKodu
}

// Her SOAP call:
const client = await soap.createClientAsync(`${domain}/Servis/UrunServis.cvc?singleWsdl`);
const result = await client.SaveUrunAsync({ UyeKodu: apiKey, urunKartlari: {...} });

// Sipariş için farklı WSDL:
const orderClient = await soap.createClientAsync(`${domain}/Servis/SiparisServis.cvc?singleWsdl`);
```

### IdeaSoft Auth Uyarısı

Tano-b2b mevcut IdeaSoft adapter'ı Bearer token (`ideasoft_access_token`) kullanıyor. Bu doğru - IdeaSoft OAuth2 destekliyor. Araştırılan C# repo ise Basic Auth kullanıyor (eski yöntem). Mevcut Bearer token yöntemi daha güvenli, değiştirilmesine gerek yok.

### Stok Güncelleme Endpoint Farkı (Trendyol)

Trendyol'da stok+fiyat güncelleme için **ayrı endpoint** var:
```
POST /sapigw/suppliers/{supplierId}/products/price-and-inventory
```
Ürün update'iyle (`PUT /v2/products`) karıştırılmamalı.

---

## Karşılaştırma Tablosu

| Platform | Auth Yöntemi | Protokol | Async? | Stok Endpoint Ayrı? |
|----------|-------------|----------|--------|---------------------|
| Shopify  | Admin API Key / OAuth | REST JSON | Hayır | Hayır (variant update) |
| ikas     | Bearer token | REST JSON | Hayır | Hayır |
| TSoft    | (araştırılmadı) | - | - | - |
| IdeaSoft | Bearer token (OAuth) | REST JSON | Hayır | Hayır (variant update) |
| Trendyol | Basic Auth (key:secret) | REST JSON | **Evet** | **Evet** |
| Ticimax  | API Key (UyeKodu) | **SOAP** | Hayır | Hayır (VaryasyonGuncelle) |
| Hepsiburada | JWT Bearer + Basic | REST JSON | Evet | Evet |

---

## Key Files (tano-b2b mevcut)

- `/Users/ertugrul.aslan/Desktop/tano-b2b/src/lib/marketplace/types.ts` - MarketplaceAdapter interface
- `/Users/ertugrul.aslan/Desktop/tano-b2b/src/lib/marketplace/adapters/ideasoft.adapter.ts` - IdeaSoft referans implementasyon
- `/Users/ertugrul.aslan/Desktop/tano-b2b/src/lib/marketplace/registry.ts` - Adapter registry

## Open Questions
- TSoft'un auth/endpoint yapısı araştırılmadı
- Ticimax'ta `node-soap` dependency eklenip eklenmeyeceği - alternatif olarak raw XML SOAP isteği de gönderilebilir
- Trendyol adapter'ı için `asyncTrackingId` polling mekanizması nasıl çalışacak (webhook vs polling)

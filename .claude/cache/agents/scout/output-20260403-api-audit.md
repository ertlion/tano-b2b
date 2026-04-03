# API Shape Mismatch Audit Report
Generated: 2026-04-03

## Summary

Audited 12 page files against 14 API route files. Found **8 confirmed mismatches** causing production errors.

---

## MISMATCH 1 — CRITICAL
**Page:** `src/app/admin/products/page.tsx`
**API:** `src/app/api/admin/products/route.ts`

### What the page expects
```js
setData(json)         // line 60
data.products         // line 80 (mapped in table)
data.total            // line 80 (totalPages calc)
data.page
data.limit
json.categories       // line 62 (category dropdown)
```
The page assigns the raw `json` to `data`, then accesses `data.products` and `data.categories` from the top level.

### What the API actually returns
```json
{
  "success": true,
  "data": [...products with masterVariants],
  "meta": { "total": N, "page": N, "limit": N, "totalPages": N }
}
```

### Mismatches
- Page does `data.products` → API returns product array at `data.data` (no `.products` key)
- Page does `data.total` → API returns `data.meta.total`
- Page reads `json.categories` → API never returns a `categories` field at all

### Fix
```js
const json = await res.json();
setData({
  products: json.data,
  total: json.meta.total,
  page: json.meta.page,
  limit: json.meta.limit,
});
setCategories(/* API does not return categories - need separate call or drop filter */);
```

---

## MISMATCH 2 — CRITICAL
**Page:** `src/app/admin/products/[id]/page.tsx`
**API:** `src/app/api/admin/products/[id]/route.ts`

### What the page expects
```js
const data = await res.json()
setProduct(data)           // line 58
data.name, data.description, data.category, ...  // direct top-level access
product.variants           // line 232 — renders variant table
```

### What the API actually returns (GET)
```json
{ "success": true, "data": { ...product, "masterVariants": [...] } }
```

### Mismatches
- Page accesses `data.name`, `data.sku`, etc. directly → real data is at `data.data.name`, `data.data.sku`, etc.
- Page renders `product.variants` → API returns the array as `masterVariants`, not `variants`

### Fix
```js
const json = await res.json();
const product = json.data;
setProduct({ ...product, variants: product.masterVariants });
setForm({ name: product.name, ... });
```

---

## MISMATCH 3 — CRITICAL
**Page:** `src/app/admin/orders/page.tsx`
**API:** `src/app/api/admin/orders/route.ts`

### What the page expects
```js
setData(json)       // line 73
data.orders         // line 125 (table render)
data.total          // line 89 (pagination)
```

### What the API actually returns
```json
{
  "success": true,
  "data": [...orders],
  "meta": { "total": N, "page": N, "limit": N, "totalPages": N }
}
```

### Mismatches
- `data.orders` → real data is at `data.data` (no `.orders` wrapper key)
- `data.total` → real value is at `data.meta.total`

Additionally, the page filters by `tenant` param: `params.set("tenant", tenantFilter)` but the API reads `searchParams.get("tenantId")` — the param name doesn't match.

### Fix
```js
const json = await res.json();
setData({
  orders: json.data,
  total: json.meta.total,
  page: json.meta.page,
  limit: json.meta.limit,
});
```
Also rename query param from `tenant` to `tenantId`.

---

## MISMATCH 4 — CRITICAL
**Page:** `src/app/admin/orders/[id]/page.tsx`
**API:** `src/app/api/admin/orders/[id]/route.ts`

### What the page expects
```js
const data = await res.json()
setOrder(data)           // line 95
data.status              // line 96
data.cargoCompany        // line 97
data.tenantCompany       // line 186 (rendered in h1 subtitle)
data.statusHistory       // line 379 (rendered in timeline)
```

### What the API actually returns (GET)
```json
{
  "success": true,
  "data": {
    ...order,
    "tenant": { "id": N, "name": "...", "email": "...", "company": "...", ... },
    "orderStatusHistory": [...]
  }
}
```

### Mismatches
- Page reads `data.tenantCompany` → API returns `data.data.tenant.company`
- Page reads `data.statusHistory` → API returns `data.data.orderStatusHistory`
- All fields one level deep: `data.status` → should be `data.data.status`

### Fix
```js
const json = await res.json();
const order = {
  ...json.data,
  tenantCompany: json.data.tenant?.company ?? "",
  statusHistory: json.data.orderStatusHistory ?? [],
};
setOrder(order);
setNewStatus(order.status);
```

---

## MISMATCH 5 — CRITICAL
**Page:** `src/app/admin/tenants/page.tsx`
**API:** `src/app/api/admin/tenants/route.ts`

### What the page expects
```js
setTenants(data.tenants || [])   // line 44
```

### What the API actually returns
```json
{ "success": true, "data": [...tenants] }
```

### Mismatch
- Page reads `data.tenants` → API returns array at `data.data` (no `.tenants` key)

### Fix
```js
setTenants(data.data || []);
```

---

## MISMATCH 6 — CRITICAL
**Page:** `src/app/admin/tenants/[id]/page.tsx`
**API:** `src/app/api/admin/tenants/[id]/route.ts`

### What the page expects
```js
const data = await res.json()
setTenant(data)              // line 68
tenant.activeProductsCount   // line 169 (rendered)
tenant.orders                // line 217 (rendered as table)
```

### What the API actually returns
```json
{
  "success": true,
  "data": {
    ...tenantFields,
    "tenantProductsCount": N,
    "ordersCount": N
  }
}
```

### Mismatches (3 separate issues)
1. All fields one level deep — page reads `data.name`, `data.email`, etc. but real data is at `data.data.*`
2. Page reads `tenant.activeProductsCount` → API returns `tenantProductsCount` (different key name)
3. Page renders `tenant.orders` (an array of orders with full details) → API only returns `ordersCount` (a number), no orders array at all — the orders table will always be empty

### Fix
```js
const json = await res.json();
setTenant({
  ...json.data,
  activeProductsCount: json.data.tenantProductsCount,
  orders: [],  // API doesn't return orders — need separate fetch or API must be extended
});
```
**API must also be extended** to return recent orders array if the orders table on this page is to work.

---

## MISMATCH 7 — CRITICAL
**Page:** `src/app/admin/settings/page.tsx`
**API:** `src/app/api/admin/settings/route.ts`

### What the page expects (GET)
```js
const data = await res.json()
if (data.smtp) { setForm(...data.smtp...) }   // line 31-37
```
Page also saves via `PUT` method.

### What the API actually returns (GET)
```json
{ "success": true, "data": { "key1": "val1", "key2": "val2" } }
```
The API returns a flat key-value map under `data.data`. There is no `smtp` object; individual keys like `smtp_host`, `smtp_port` etc. would be stored if any were set.

**The API has no PUT handler** — only GET and POST. The page calls `PUT /api/admin/settings` which will return 405 Method Not Allowed.

### Mismatches
1. Page reads `data.smtp` → API never returns an `smtp` nested object
2. Page sends `PUT` → API only has `GET` and `POST` handlers (405 error)
3. Page sends `{ smtp: { host, port, user, password } }` to save → API's POST handler stores flat key-value pairs and explicitly **blocks** keys containing "password" — so SMTP password will never be saved

### Fix for GET (reading):
```js
const json = await res.json();
const settings = json.data;
setForm({
  host: settings["smtp_host"] || "",
  port: settings["smtp_port"] || "587",
  user: settings["smtp_user"] || "",
  password: "",  // API blocks password keys
});
```
**API must also add a PUT handler** (or the page must use POST), and the API's blocked-key list must not block `smtp_password`.

---

## MISMATCH 8 — CRITICAL
**Page:** `src/app/admin/products/import/page.tsx`
**API:** `src/app/api/admin/products/import/route.ts`

### What the page expects
```js
setResult(data)          // line 89 — raw response assigned to result
result.newProducts       // line 193
result.updatedProducts   // line 198
result.totalVariants     // line 203
result.stockChanges      // line 217 — iterates as array
result.errors            // line 205
```

### What the API actually returns
```json
{
  "success": true,
  "data": {
    "newProducts": N,
    "updatedProducts": N,
    "totalVariants": N,
    "stockChangesCount": N,
    "errors": [...]
  }
}
```

### Mismatches
- Page reads `result.newProducts` → real value is at `data.data.newProducts`
- Page iterates `result.stockChanges` as an array → API returns `stockChangesCount` (a number), **no array** — the stock changes table will always be empty/crash

### Fix
```js
const data = await res.json();
setResult(data.data);
// Note: stockChanges array is not returned by API — either drop the table or extend API
```

---

## MISMATCH 9 — MEDIUM
**Page:** `src/app/panel/dashboard/page.tsx`
**API:** `src/app/api/panel/dashboard/route.ts`

### What the page expects
```js
setData(json)            // line 87 — raw response
data.stats.activeProducts
data.stats.pendingProducts
data.stats.totalOrders
data.stats.pendingOrders
data.recentOrders
```

### What the API actually returns
```json
{
  "success": true,
  "data": {
    "activeProducts": N,
    "pendingProducts": N,
    "totalOrders": N,
    "pendingOrders": N,
    "recentOrders": [...]
  }
}
```

### Mismatches
- Page reads `data.stats.activeProducts` → real data is at `data.data.activeProducts` (no `stats` wrapper, and one extra nesting level)
- Page reads `data.recentOrders` → real data is at `data.data.recentOrders`

### Fix
```js
const json = await res.json();
setData({
  stats: {
    activeProducts: json.data.activeProducts,
    pendingProducts: json.data.pendingProducts,
    totalOrders: json.data.totalOrders,
    pendingOrders: json.data.pendingOrders,
  },
  recentOrders: json.data.recentOrders,
});
```

---

## MISMATCH 10 — CRITICAL
**Page:** `src/app/panel/products/page.tsx`
**API:** `src/app/api/panel/products/route.ts` (tab=active and tab=all)

### What the page expects
```js
setData(json)
data.products    // line 98
data.total       // line 88 (but page doesn't paginate so this isn't used directly)
```
Page renders `product.name`, `product.sku`, `product.category`, `product.sizes`, `product.totalStock`, `product.status`.

### What the API actually returns (tab=active)
```json
{
  "success": true,
  "data": [
    {
      "id": N,
      "tenantId": N,
      "masterProductId": N,
      "status": "active",
      "masterProduct": {
        "name": "...",
        "sku": "...",
        "category": "...",
        "masterVariants": [...]
      }
    }
  ],
  "meta": { "total": N, ... }
}
```

### Mismatches
- `data.products` → API returns `data.data` (no `.products` key)
- `product.name`, `product.sku`, `product.category` → these fields are nested inside `product.masterProduct.name`, etc. (for active/all tabs)
- `product.sizes` → not a direct field; must be derived from `product.masterProduct.masterVariants.map(v => v.size)`
- `product.totalStock` → not a direct field; must be summed from variants

### Fix
```js
const json = await res.json();
const products = (json.data || []).map((p: any) => ({
  id: p.id,
  masterProductId: p.masterProductId,
  name: p.masterProduct?.name ?? "",
  sku: p.masterProduct?.sku ?? "",
  category: p.masterProduct?.category ?? null,
  sizes: p.masterProduct?.masterVariants?.map((v: any) => v.size) ?? [],
  totalStock: p.masterProduct?.masterVariants?.reduce((sum: number, v: any) => sum + (v.stockQuantity ?? 0), 0) ?? 0,
  status: p.status,
  syncedAt: p.syncedAt ?? null,
}));
setData({ products, total: json.meta.total });
```

---

## MISMATCH 11 — CRITICAL
**Page:** `src/app/panel/products/new/page.tsx`
**API:** `src/app/api/panel/products/route.ts` (tab=new)

### What the page expects
```js
setData(json)
data.products    // line 225
// products rendered with: product.name, product.sku, product.category, product.subcategory,
//   product.color, product.material, product.sizes, product.priceRange, product.totalStock
```

### What the API actually returns (tab=new)
```json
{
  "success": true,
  "data": [
    {
      "id": N,
      "sku": "...",
      "name": "...",
      "category": "...",
      "masterVariants": [{ "size": "...", "salePrice": "...", "stockQuantity": N, ... }]
    }
  ],
  "meta": { "total": N, ... }
}
```

### Mismatches
- `data.products` → real data at `data.data`
- `product.sizes` → must be derived from `product.masterVariants.map(v => v.size)`
- `product.priceRange` → must be derived from `product.masterVariants` prices
- `product.totalStock` → must be summed from variants
- `product.subcategory`, `product.color`, `product.material` → these ARE present in masterProducts, so they will work once the top-level wrapping is fixed

### Fix
```js
const json = await res.json();
const products = (json.data || []).map((p: any) => ({
  id: p.id,
  sku: p.sku,
  name: p.name,
  category: p.category ?? null,
  subcategory: p.subcategory ?? null,
  color: p.color ?? null,
  material: p.material ?? null,
  sizes: p.masterVariants?.map((v: any) => v.size) ?? [],
  priceRange: {
    min: Math.min(...(p.masterVariants?.map((v: any) => Number(v.salePrice)) ?? [0])),
    max: Math.max(...(p.masterVariants?.map((v: any) => Number(v.salePrice)) ?? [0])),
  },
  totalStock: p.masterVariants?.reduce((sum: number, v: any) => sum + (v.stockQuantity ?? 0), 0) ?? 0,
}));
setData({ products, total: json.meta.total });
```

---

## MISMATCH 12 — CRITICAL
**Page:** `src/app/panel/orders/page.tsx`
**API:** `src/app/api/panel/orders/route.ts`

### What the page expects
```js
setData(json)
data.orders      // line 115
data.total       // line 88
```

### What the API actually returns
```json
{
  "success": true,
  "data": [...orders],
  "meta": { "total": N, "page": N, "limit": N, "totalPages": N }
}
```

### Mismatches
- `data.orders` → real data at `data.data`
- `data.total` → real value at `data.meta.total`

### Fix
```js
const json = await res.json();
setData({
  orders: json.data,
  total: json.meta.total,
  page: json.meta.page,
  limit: json.meta.limit,
});
```

---

## MISMATCH 13 — CRITICAL
**Page:** `src/app/panel/orders/[id]/page.tsx`
**API:** `src/app/api/panel/orders/[id]/route.ts`

### What the page expects
```js
const data = await res.json()
setOrder(data)           // line 85
order.statusHistory      // line 303
order.items              // line 122
order.shippingAddress    // line 123
```

### What the API actually returns
```json
{
  "success": true,
  "data": {
    ...order,
    "orderStatusHistory": [...]
  }
}
```

### Mismatches
- All fields one level deep: `data.orderNumber` etc. → should be `data.data.orderNumber`
- `order.statusHistory` → API returns `orderStatusHistory` (different key name)

### Fix
```js
const json = await res.json();
const order = {
  ...json.data,
  statusHistory: json.data.orderStatusHistory ?? [],
};
setOrder(order);
```

---

## MISMATCH 14 — CRITICAL
**Page:** `src/app/panel/settings/page.tsx`
**API:** `src/app/api/panel/settings/route.ts`

### What the page expects (GET)
```js
const data = await res.json()
if (data.marketplace) { setMarketplace(data.marketplace) }    // line 53
if (data.credentials) { setCredentials(data.credentials) }   // line 56
```
Page also saves via `PUT` method.

### What the API actually returns (GET)
```json
{
  "success": true,
  "data": {
    "marketplace": "shopify",
    "marketplaceDisplayName": "Shopify",
    "settingsKeys": [...],
    "settings": { "storeUrl": "...", "apiKey": "..." }
  }
}
```

**The API has no PUT handler** — only GET and POST.

### Mismatches
1. `data.marketplace` → should be `data.data.marketplace`
2. `data.credentials` → API returns `data.data.settings` (different key name)
3. Page sends `PUT` request → API only handles POST (will 405)
4. Page sends `{ marketplace, credentials }` → API only reads `credentials`-style keys but from POST body directly (not nested under `credentials`)

### Fix (page side)
```js
const json = await res.json();
if (json.data?.marketplace) setMarketplace(json.data.marketplace);
if (json.data?.settings) setCredentials(json.data.settings);
```
For save, change `method: "PUT"` to `method: "POST"` and send credentials flat (not nested under `credentials` key):
```js
body: JSON.stringify(credentials)   // not { marketplace, credentials }
```

---

## MISMATCH 15 — MEDIUM
**Page:** `src/app/panel/products/new/page.tsx`
**API:** `src/app/api/panel/categories/route.ts`

### What the page expects
```js
setCategories(json.categories || [])   // line 70
// each category: { id, name, parentId? }
```

### What the API actually returns
```json
{ "success": true, "data": [...categories] }
```

### Mismatch
- `json.categories` → real data at `json.data`

### Fix
```js
setCategories(json.data || []);
```

---

## Summary Table

| # | Page | API Route | Severity | Issue |
|---|------|-----------|----------|-------|
| 1 | admin/products/page.tsx | admin/products/route.ts | CRITICAL | `data.products` → `data.data`; `data.total` → `data.meta.total`; `categories` missing |
| 2 | admin/products/[id]/page.tsx | admin/products/[id]/route.ts | CRITICAL | All fields at `data.data.*`; `variants` → `masterVariants` |
| 3 | admin/orders/page.tsx | admin/orders/route.ts | CRITICAL | `data.orders` → `data.data`; `data.total` → `data.meta.total`; tenant filter param `tenant` → `tenantId` |
| 4 | admin/orders/[id]/page.tsx | admin/orders/[id]/route.ts | CRITICAL | All fields at `data.data.*`; `tenantCompany` → `data.tenant.company`; `statusHistory` → `orderStatusHistory` |
| 5 | admin/tenants/page.tsx | admin/tenants/route.ts | CRITICAL | `data.tenants` → `data.data` |
| 6 | admin/tenants/[id]/page.tsx | admin/tenants/[id]/route.ts | CRITICAL | All fields at `data.data.*`; `activeProductsCount` → `tenantProductsCount`; `orders` array not returned |
| 7 | admin/settings/page.tsx | admin/settings/route.ts | CRITICAL | `data.smtp` not returned; no PUT handler (405); password key blocked by API |
| 8 | admin/products/import/page.tsx | admin/products/import/route.ts | CRITICAL | All fields at `data.data.*`; `stockChanges` array not returned (only `stockChangesCount`) |
| 9 | panel/dashboard/page.tsx | panel/dashboard/route.ts | CRITICAL | `data.stats.*` → `data.data.*`; `data.recentOrders` → `data.data.recentOrders` |
| 10 | panel/products/page.tsx | panel/products/route.ts | CRITICAL | `data.products` → `data.data`; nested masterProduct fields not flattened |
| 11 | panel/products/new/page.tsx | panel/products/route.ts | CRITICAL | `data.products` → `data.data`; `sizes`, `priceRange`, `totalStock` must be derived from variants |
| 12 | panel/orders/page.tsx | panel/orders/route.ts | CRITICAL | `data.orders` → `data.data`; `data.total` → `data.meta.total` |
| 13 | panel/orders/[id]/page.tsx | panel/orders/[id]/route.ts | CRITICAL | All fields at `data.data.*`; `statusHistory` → `orderStatusHistory` |
| 14 | panel/settings/page.tsx | panel/settings/route.ts | CRITICAL | `data.marketplace` → `data.data.marketplace`; `data.credentials` → `data.data.settings`; no PUT handler |
| 15 | panel/products/new/page.tsx | panel/categories/route.ts | MEDIUM | `json.categories` → `json.data` |

## Root Cause

Every API route uses the consistent envelope `{ success: true, data: ..., meta?: ... }`. But almost every page either:
- Reads the raw response as if `data` is the top level (`json.orders`, `json.products`) 
- Or correctly unwraps one level but uses wrong sub-key names (`statusHistory` vs `orderStatusHistory`, `variants` vs `masterVariants`)

The systematic fix is: **always read `json.data` for the payload, and `json.meta` for pagination metadata**.

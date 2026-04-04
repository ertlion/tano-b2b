# Implementation Report: Cargo API Integration

Generated: 2026-04-03

## Task
Build cargo (kargo) API integrations supporting 5 Turkish carriers: Yurtici, Aras, MNG, Surat, PTT. Each tenant can configure their own cargo provider and API credentials.

## Changes Made

### New Files Created

1. **`src/lib/cargo/types.ts`** - Core interfaces: CargoAdapter, CargoShipment, CargoShipmentParams, CargoProviderName type
2. **`src/lib/cargo/settings-map.ts`** - Provider settings configuration (credentials fields per carrier)
3. **`src/lib/cargo/registry.ts`** - Adapter registry with getCargoAdapter, getCargoTrackingUrl, resolveProviderName
4. **`src/lib/cargo/adapters/yurtici.ts`** - Yurtici Kargo stub adapter with SOAP API docs
5. **`src/lib/cargo/adapters/aras.ts`** - Aras Kargo stub adapter with SOAP API docs
6. **`src/lib/cargo/adapters/mng.ts`** - MNG Kargo stub adapter with REST API docs
7. **`src/lib/cargo/adapters/surat.ts`** - Surat Kargo stub adapter with SOAP API docs
8. **`src/lib/cargo/adapters/ptt.ts`** - PTT Kargo stub adapter with SOAP API docs
9. **`src/app/api/panel/cargo/settings/route.ts`** - GET/POST API for tenant cargo settings

### Modified Files

10. **`src/app/panel/settings/page.tsx`** - Added "Kargo Ayarlari" section with provider dropdown and dynamic credential fields
11. **`src/app/admin/orders/[id]/page.tsx`** - Changed cargo company from text input to dropdown with all 5 carriers
12. **`src/app/api/admin/orders/[id]/status/route.ts`** - Auto-generates tracking URL when status changes to "shipped"

## Architecture

- **Settings storage**: Uses existing `settings` table (key-value per tenant) - no schema migration needed
- **Adapter pattern**: Each carrier implements CargoAdapter interface with createShipment (stub), getTrackingUrl (working), and optional getLabel
- **Registry**: Central registry resolves provider names (including fuzzy matching like "Aras Kargo" -> "aras")
- **Tracking URLs**: Real public tracking URLs for all 5 carriers (working now, no API needed)
- **Auto URL generation**: When admin marks order as "shipped" with cargo company + tracking number, tracking URL is auto-generated

## Build Status
- Build: PASS (no errors, only pre-existing img warnings)

## Notes
- All createShipment methods throw "API entegrasyonu yakinda aktif olacak" - marked with TODO comments and documented API structures
- Each adapter file contains the real API endpoint URLs and request structure in comments for future implementation
- Password fields are masked in GET responses (same pattern as marketplace settings)

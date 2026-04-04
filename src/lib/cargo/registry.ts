import type { CargoAdapter, CargoProviderName } from "./types";
import { yurticiAdapter } from "./adapters/yurtici";
import { arasAdapter } from "./adapters/aras";
import { mngAdapter } from "./adapters/mng";
import { suratAdapter } from "./adapters/surat";
import { pttAdapter } from "./adapters/ptt";

const ADAPTERS: Record<CargoProviderName, CargoAdapter> = {
  yurtici: yurticiAdapter,
  aras: arasAdapter,
  mng: mngAdapter,
  surat: suratAdapter,
  ptt: pttAdapter,
};

/**
 * Get cargo adapter by provider name.
 * Throws if provider is not supported.
 */
export function getCargoAdapter(provider: string): CargoAdapter {
  const adapter = ADAPTERS[provider as CargoProviderName];
  if (!adapter) {
    throw new Error(`Desteklenmeyen kargo firması: ${provider}`);
  }
  return adapter;
}

/**
 * Build tracking URL for a given provider and tracking number.
 * Returns null if provider is unknown.
 */
export function getCargoTrackingUrl(
  provider: string,
  trackingNumber: string
): string | null {
  const adapter = ADAPTERS[provider as CargoProviderName];
  if (!adapter) return null;
  return adapter.getTrackingUrl(trackingNumber);
}

/**
 * Try to resolve a cargo company display name to its internal provider key.
 * Supports fuzzy matching (e.g. "Aras Kargo" -> "aras", "yurtici" -> "yurtici").
 */
export function resolveProviderName(cargoCompany: string): CargoProviderName | null {
  if (!cargoCompany) return null;

  const normalized = cargoCompany.toLowerCase().trim();

  // Direct match
  if (normalized in ADAPTERS) return normalized as CargoProviderName;

  // Fuzzy matching
  const mappings: Record<string, CargoProviderName> = {
    "yurtici": "yurtici",
    "yurtici kargo": "yurtici",
    "yurticikargo": "yurtici",
    "aras": "aras",
    "aras kargo": "aras",
    "araskargo": "aras",
    "mng": "mng",
    "mng kargo": "mng",
    "mngkargo": "mng",
    "surat": "surat",
    "surat kargo": "surat",
    "suratkargo": "surat",
    "ptt": "ptt",
    "ptt kargo": "ptt",
    "pttkargo": "ptt",
  };

  return mappings[normalized] ?? null;
}

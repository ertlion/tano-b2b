import { getTenantSettings } from "@/lib/tenant-settings";
import { MARKETPLACE_SETTINGS } from "./settings-map";
import type { MarketplaceCredentials, MarketplaceName } from "./types";

export async function resolveCredentials(
  tenantId: number,
  marketplace: MarketplaceName
): Promise<MarketplaceCredentials | null> {
  const allSettings = await getTenantSettings(tenantId);
  const config = MARKETPLACE_SETTINGS[marketplace];
  if (!config) return null;

  const creds: Record<string, unknown> = { marketplace };

  const credentialKeys = config.settingsKeys.filter((s) => s.group !== "pricing");

  for (const { key } of credentialKeys) {
    creds[key] = allSettings[key] || undefined;
  }

  const hasAnyValue = credentialKeys.some((s) => !!allSettings[s.key]);
  if (!hasAnyValue) return null;

  return creds as MarketplaceCredentials;
}

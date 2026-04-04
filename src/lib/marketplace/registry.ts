import type { MarketplaceAdapter, MarketplaceName } from "./types";
import { ShopifyAdapter } from "./adapters/shopify.adapter";
import { IkasAdapter } from "./adapters/ikas.adapter";
import { TSoftAdapter } from "./adapters/tsoft.adapter";
import { IdeaSoftAdapter } from "./adapters/ideasoft.adapter";
import { TrendyolAdapter } from "./adapters/trendyol.adapter";

const adapters = new Map<MarketplaceName, MarketplaceAdapter>();

function registerAdapter(adapter: MarketplaceAdapter): void {
  adapters.set(adapter.name, adapter);
}

registerAdapter(new ShopifyAdapter());
registerAdapter(new IkasAdapter());
registerAdapter(new TSoftAdapter());
registerAdapter(new IdeaSoftAdapter());
registerAdapter(new TrendyolAdapter());

export function getAdapter(marketplace: MarketplaceName): MarketplaceAdapter {
  const adapter = adapters.get(marketplace);
  if (!adapter) {
    throw new Error(`Marketplace adapter not found: ${marketplace}`);
  }
  return adapter;
}

export function hasAdapter(marketplace: MarketplaceName): boolean {
  return adapters.has(marketplace);
}

export function getAllRegisteredAdapters(): MarketplaceAdapter[] {
  return Array.from(adapters.values());
}

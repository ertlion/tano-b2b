import type { MarketplaceName } from "./types";

function pricingKeys(prefix: string) {
  return [
    { key: `${prefix}_price_adjustment`, label: "Fiyat Değişimi (%)", type: "number" as const, group: "pricing" as const },
    { key: `${prefix}_price_rounding`, label: "Fiyat Yuvarlama", type: "select" as const, group: "pricing" as const, options: [{ value: "none", label: "Yuvarlama Yok" }, { value: "49", label: ",49'a Yuvarla" }, { value: "99", label: ",99'a Yuvarla" }] },
  ];
}

export const MARKETPLACE_SETTINGS: Record<
  MarketplaceName,
  {
    displayName: string;
    settingsKeys: Array<{
      key: string;
      label: string;
      type: "text" | "password" | "select" | "number";
      options?: Array<{ value: string; label: string }>;
      group?: "credentials" | "pricing";
    }>;
  }
> = {
  shopify: {
    displayName: "Shopify",
    settingsKeys: [
      { key: "shopify_store_url", label: "Store URL", type: "text" },
      { key: "shopify_client_id", label: "Client ID", type: "text" },
      { key: "shopify_client_secret", label: "Client Secret", type: "password" },
      { key: "shopify_product_status", label: "Ürün Durumu", type: "select", options: [{ value: "draft", label: "Taslak" }, { value: "active", label: "Aktif" }] },
      ...pricingKeys("shopify"),
    ],
  },
  ikas: {
    displayName: "ikas",
    settingsKeys: [
      { key: "ikas_store_url", label: "Mağaza URL", type: "text" },
      { key: "ikas_api_key", label: "API Key", type: "text" },
      { key: "ikas_api_secret", label: "API Secret", type: "password" },
      ...pricingKeys("ikas"),
    ],
  },
  tsoft: {
    displayName: "TSoft",
    settingsKeys: [
      { key: "tsoft_base_url", label: "API URL", type: "text" },
      { key: "tsoft_username", label: "Kullanıcı Adı", type: "text" },
      { key: "tsoft_password", label: "Şifre", type: "password" },
      ...pricingKeys("tsoft"),
    ],
  },
  ideasoft: {
    displayName: "IdeaSoft",
    settingsKeys: [
      { key: "ideasoft_store_url", label: "Mağaza URL", type: "text" },
      { key: "ideasoft_access_token", label: "Access Token", type: "password" },
      ...pricingKeys("ideasoft"),
    ],
  },
};

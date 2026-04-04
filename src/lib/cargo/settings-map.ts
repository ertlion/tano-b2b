import type { CargoProviderName } from "./types";

export interface CargoSettingsKey {
  key: string;
  label: string;
  type: "text" | "password";
}

export interface CargoProviderConfig {
  displayName: string;
  settingsKeys: CargoSettingsKey[];
}

export const CARGO_SETTINGS: Record<CargoProviderName, CargoProviderConfig> = {
  yurtici: {
    displayName: "Yurtici Kargo",
    settingsKeys: [
      { key: "yurtici_username", label: "Kullanici Adi", type: "text" },
      { key: "yurtici_password", label: "Sifre", type: "password" },
      {
        key: "yurtici_user_language",
        label: "Dil (TR)",
        type: "text",
      },
    ],
  },
  aras: {
    displayName: "Aras Kargo",
    settingsKeys: [
      { key: "aras_username", label: "Kullanici Adi", type: "text" },
      { key: "aras_password", label: "Sifre", type: "password" },
      { key: "aras_customer_code", label: "Musteri Kodu", type: "text" },
    ],
  },
  mng: {
    displayName: "MNG Kargo",
    settingsKeys: [
      { key: "mng_username", label: "Kullanici Adi", type: "text" },
      { key: "mng_password", label: "Sifre", type: "password" },
      {
        key: "mng_customer_number",
        label: "Musteri Numarasi",
        type: "text",
      },
    ],
  },
  surat: {
    displayName: "Surat Kargo",
    settingsKeys: [
      { key: "surat_username", label: "Kullanici Adi", type: "text" },
      { key: "surat_password", label: "Sifre", type: "password" },
      { key: "surat_customer_code", label: "Musteri Kodu", type: "text" },
    ],
  },
  ptt: {
    displayName: "PTT Kargo",
    settingsKeys: [
      { key: "ptt_username", label: "Kullanici Adi", type: "text" },
      { key: "ptt_password", label: "Sifre", type: "password" },
      { key: "ptt_customer_id", label: "Musteri ID", type: "text" },
    ],
  },
};

/** All valid cargo provider names */
export const CARGO_PROVIDER_NAMES = Object.keys(CARGO_SETTINGS) as CargoProviderName[];

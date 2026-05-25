import { db } from "./db";
import { appConfig } from "./schema";
import { eq } from "drizzle-orm";

// ─── Merkezi Yapılandırma (app_config DB → env fallback) ───────
// Entegrasyon credential'ları admin panelden (app_config) yönetilir.
// Bir anahtar DB'de boşsa env değişkenine düşer (key.toUpperCase()).
// Kısa cache ile her istekte DB'ye gidilmez.

const TTL = 30_000;
const cache = new Map<string, { v: string | undefined; exp: number }>();

export async function getConfigValue(key: string): Promise<string | undefined> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.v;

  let v: string | undefined;
  try {
    const row = await db.query.appConfig.findFirst({ where: eq(appConfig.key, key) });
    if (row?.value && row.value.trim() !== "") v = row.value;
  } catch {
    // DB erişilemezse env'e düş
  }
  if (v === undefined) {
    const envVal = process.env[key.toUpperCase()];
    if (envVal && envVal.trim() !== "") v = envVal;
  }
  cache.set(key, { v, exp: Date.now() + TTL });
  return v;
}

export async function getConfigValues(keys: string[]): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  await Promise.all(keys.map(async (k) => { out[k] = await getConfigValue(k); }));
  return out;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: new Date() } });
  cache.delete(key);
}

export function clearConfigCache(): void {
  cache.clear();
}

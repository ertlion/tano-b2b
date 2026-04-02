import { db } from "./db";
import { settings } from "./schema";
import { eq, and } from "drizzle-orm";

export async function getTenantSetting(
  tenantId: number,
  key: string
): Promise<string | null> {
  const result = await db.query.settings.findFirst({
    where: and(eq(settings.tenantId, tenantId), eq(settings.key, key)),
  });
  return result?.value ?? null;
}

export async function getTenantSettings(
  tenantId: number
): Promise<Record<string, string>> {
  const results = await db.query.settings.findMany({
    where: eq(settings.tenantId, tenantId),
  });
  const map: Record<string, string> = {};
  for (const r of results) {
    map[r.key] = r.value;
  }
  return map;
}

export async function setTenantSetting(
  tenantId: number,
  key: string,
  value: string
): Promise<void> {
  await db
    .insert(settings)
    .values({ tenantId, key, value })
    .onConflictDoUpdate({
      target: [settings.tenantId, settings.key],
      set: { value },
    });
}

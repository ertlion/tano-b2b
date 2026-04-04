import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { eq, and, like } from "drizzle-orm";
import type { ParasutConfig } from "@/lib/parasut";

const ADMIN_TENANT_ID = 1;

export async function loadParasutConfig(): Promise<ParasutConfig | null> {
  const rows = await db.query.settings.findMany({
    where: and(
      eq(settings.tenantId, ADMIN_TENANT_ID),
      like(settings.key, "parasut_%")
    ),
  });

  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }

  const clientId = map["parasut_client_id"];
  const clientSecret = map["parasut_client_secret"];
  const email = map["parasut_email"];
  const password = map["parasut_password"];
  const companyId = map["parasut_company_id"];

  if (!clientId || !clientSecret || !email || !password || !companyId) {
    return null;
  }

  return { clientId, clientSecret, email, password, companyId };
}

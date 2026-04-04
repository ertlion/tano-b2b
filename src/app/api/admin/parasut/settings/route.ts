import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { eq, and, like } from "drizzle-orm";

const PARASUT_KEYS = [
  "parasut_client_id",
  "parasut_client_secret",
  "parasut_email",
  "parasut_password",
  "parasut_company_id",
] as const;

const SENSITIVE_KEYS = ["parasut_client_secret", "parasut_password"];

// Admin tenant ID for global settings
const ADMIN_TENANT_ID = 1;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const allSettings = await db.query.settings.findMany({
      where: and(
        eq(settings.tenantId, ADMIN_TENANT_ID),
        like(settings.key, "parasut_%")
      ),
    });

    const result: Record<string, string> = {};
    for (const s of allSettings) {
      if (SENSITIVE_KEYS.includes(s.key)) {
        // Mask sensitive values: show only last 4 chars
        result[s.key] = s.value.length > 4 ? "****" + s.value.slice(-4) : "****";
      } else {
        result[s.key] = s.value;
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();

    for (const key of PARASUT_KEYS) {
      const value = body[key];
      if (value === undefined || value === null) continue;
      // Skip masked values (user didn't change them)
      if (typeof value === "string" && value.startsWith("****")) continue;

      const stringValue = String(value).trim();
      if (!stringValue) continue;

      await db
        .insert(settings)
        .values({
          tenantId: ADMIN_TENANT_ID,
          key,
          value: stringValue,
        })
        .onConflictDoUpdate({
          target: [settings.tenantId, settings.key],
          set: { value: stringValue },
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

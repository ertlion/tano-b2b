import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { resolveCredentials } from "@/lib/marketplace/credential-resolver";
import type { MarketplaceName } from "@/lib/marketplace/types";

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { marketplace: true },
    });

    if (!tenant?.marketplace || tenant.marketplace !== "shopify") {
      return NextResponse.json({ error: "Sadece Shopify için webhook kaydı yapılabilir" }, { status: 400 });
    }

    const credentials = await resolveCredentials(tenantId, "shopify" as MarketplaceName);
    if (!credentials) {
      return NextResponse.json({ error: "Shopify bilgileri bulunamadı" }, { status: 400 });
    }

    const storeUrl = (credentials as Record<string, string>).shopify_store_url;
    const accessToken = (credentials as Record<string, string>).shopify_access_token;

    if (!storeUrl || !accessToken) {
      return NextResponse.json({ error: "Store URL veya Access Token eksik" }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `http://${request.headers.get("host")}`;
    const webhookUrl = `${appUrl}/api/webhooks/shopify`;

    // Check existing webhooks
    const listRes = await fetch(`https://${storeUrl}/admin/api/2024-01/webhooks.json`, {
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
    });

    const existingWebhooks = listRes.ok
      ? ((await listRes.json()).webhooks as Array<{ id: number; topic: string; address: string }>) || []
      : [];

    // Topics we need
    const topics = ["orders/create", "orders/updated"];
    const registered: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const topic of topics) {
      const exists = existingWebhooks.some(
        (w) => w.topic === topic && w.address === webhookUrl
      );

      if (exists) {
        skipped.push(topic);
        continue;
      }

      const res = await fetch(`https://${storeUrl}/admin/api/2024-01/webhooks.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          webhook: {
            topic,
            address: webhookUrl,
            format: "json",
          },
        }),
      });

      if (res.ok) {
        registered.push(topic);
      } else {
        const err = await res.text();
        errors.push(`${topic}: ${res.status} - ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        webhookUrl,
        registered,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
      },
      message: `${registered.length} webhook kaydedildi, ${skipped.length} zaten kayıtlı`,
    });
  } catch (error) {
    console.error("[REGISTER-WEBHOOK] error:", error);
    return NextResponse.json({ error: "Webhook kaydı başarısız" }, { status: 500 });
  }
}

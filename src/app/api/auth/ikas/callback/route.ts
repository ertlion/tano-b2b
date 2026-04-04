import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const storeUrl = searchParams.get("storeName") || searchParams.get("store") || searchParams.get("state");

    if (!code || !storeUrl) {
      return redirectWithError("Yetkilendirme kodu veya mağaza bilgisi eksik.");
    }

    const clientId = process.env.IKAS_APP_CLIENT_ID;
    const clientSecret = process.env.IKAS_APP_CLIENT_SECRET;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const redirectUri = `${appUrl}/api/auth/ikas/callback`;

    if (!clientId || !clientSecret) {
      return redirectWithError("ikas app yapılandırması eksik.");
    }

    // Clean store URL
    const cleanStore = storeUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const baseUrl = cleanStore.includes("myikas.com") ? `https://${cleanStore}` : `https://${cleanStore}.myikas.com`;
    const storeUrlNormalized = cleanStore.includes("myikas.com") ? cleanStore : `${cleanStore}.myikas.com`;

    // Exchange code for access token
    const tokenRes = await fetch(`${baseUrl}/api/admin/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("[IKAS/CALLBACK] Token exchange failed:", err);
      return redirectWithError("Token alınamadı.");
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    if (!accessToken) {
      return redirectWithError("Access token alınamadı.");
    }

    // Check if this ikas store already has a tenant
    const existingSetting = await db.query.settings.findFirst({
      where: and(
        eq(settings.key, "ikas_store_url"),
        eq(settings.value, storeUrlNormalized)
      ),
    });

    if (existingSetting) {
      // Existing tenant — update tokens and redirect to login
      const tenantId = existingSetting.tenantId;
      await upsertSetting(tenantId, "ikas_access_token", accessToken);
      if (refreshToken) await upsertSetting(tenantId, "ikas_refresh_token", refreshToken);

      console.log(`[IKAS/CALLBACK] Existing tenant ${tenantId} reconnected: ${storeUrlNormalized}`);

      // Redirect to panel (they already have an account)
      return NextResponse.redirect(`${appUrl}/login?ikas=reconnected`);
    }

    // New store — save tokens temporarily and redirect to registration
    // We'll use a temp token in the URL that the register page will use
    const tempToken = Buffer.from(JSON.stringify({
      accessToken,
      refreshToken: refreshToken || "",
      storeUrl: storeUrlNormalized,
      clientId,
      clientSecret,
      ts: Date.now(),
    })).toString("base64url");

    console.log(`[IKAS/CALLBACK] New store, redirecting to register: ${storeUrlNormalized}`);

    return NextResponse.redirect(`${appUrl}/register?ikas_token=${tempToken}`);
  } catch (err) {
    console.error("[IKAS/CALLBACK] Error:", err);
    return redirectWithError("Beklenmeyen bir hata oluştu.");
  }
}

async function upsertSetting(tenantId: number, key: string, value: string) {
  const existing = await db.query.settings.findFirst({
    where: and(eq(settings.tenantId, tenantId), eq(settings.key, key)),
  });
  if (existing) {
    await db.update(settings).set({ value }).where(eq(settings.id, existing.id));
  } else {
    await db.insert(settings).values({ tenantId, key, value });
  }
}

function redirectWithError(message: string): NextResponse {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return NextResponse.redirect(`${appUrl}/register?ikas_error=${encodeURIComponent(message)}`);
}

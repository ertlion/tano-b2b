import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, settings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // store URL
    const storeUrl = searchParams.get("store") || state;

    if (!code || !storeUrl) {
      return new NextResponse(errorPage("Yetkilendirme kodu veya mağaza bilgisi eksik."), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const clientId = process.env.IKAS_APP_CLIENT_ID;
    const clientSecret = process.env.IKAS_APP_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/ikas/callback`;

    if (!clientId || !clientSecret) {
      return new NextResponse(errorPage("ikas app yapılandırması eksik."), {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Clean store URL
    const cleanStore = storeUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const baseUrl = cleanStore.includes("myikas.com") ? `https://${cleanStore}` : `https://${cleanStore}.myikas.com`;

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
      return new NextResponse(errorPage(`Token alınamadı: ${tokenRes.status}`), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    if (!accessToken) {
      return new NextResponse(errorPage("Access token alınamadı."), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Find or create tenant for this ikas store
    const storeUrlNormalized = cleanStore.includes("myikas.com") ? cleanStore : `${cleanStore}.myikas.com`;

    // Check if a tenant with this ikas store already exists
    const existingSetting = await db.query.settings.findFirst({
      where: and(
        eq(settings.key, "ikas_store_url"),
        eq(settings.value, storeUrlNormalized)
      ),
    });

    let tenantId: number;

    if (existingSetting) {
      // Update existing tenant's tokens
      tenantId = existingSetting.tenantId;
    } else {
      // Get store info from ikas
      let storeName = storeUrlNormalized.split(".")[0];
      try {
        const shopRes = await fetch("https://api.myikas.com/api/v1/admin/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ query: "{ getStore { id name } }" }),
        });
        if (shopRes.ok) {
          const shopData = await shopRes.json();
          storeName = shopData.data?.getStore?.name || storeName;
        }
      } catch {
        // Use default name
      }

      // Create new tenant
      const [newTenant] = await db
        .insert(tenants)
        .values({
          name: storeName,
          email: `${storeUrlNormalized.split(".")[0]}@ikas.store`,
          password: "$ikas-oauth$", // OAuth user, no password login
          company: storeName,
          phone: "",
          marketplace: "ikas",
          isAdmin: false,
          isApproved: true,
          isActive: true,
        })
        .returning();

      tenantId = newTenant.id;
    }

    // Save/update ikas credentials
    const credentialsToSave: Record<string, string> = {
      ikas_store_url: storeUrlNormalized,
      ikas_api_key: clientId,
      ikas_api_secret: clientSecret,
      ikas_access_token: accessToken,
    };

    if (refreshToken) {
      credentialsToSave.ikas_refresh_token = refreshToken;
    }

    for (const [key, value] of Object.entries(credentialsToSave)) {
      const existing = await db.query.settings.findFirst({
        where: and(
          eq(settings.tenantId, tenantId),
          eq(settings.key, key)
        ),
      });

      if (existing) {
        await db
          .update(settings)
          .set({ value })
          .where(eq(settings.id, existing.id));
      } else {
        await db.insert(settings).values({
          tenantId,
          key,
          value,
        });
      }
    }

    console.log(`[IKAS/CALLBACK] Tenant ${tenantId} connected: ${storeUrlNormalized}`);

    // Success page
    return new NextResponse(successPage(storeName(storeUrlNormalized)), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("[IKAS/CALLBACK] Error:", err);
    return new NextResponse(errorPage("Beklenmeyen bir hata oluştu."), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

function storeName(url: string): string {
  return url.split(".")[0];
}

function successPage(store: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bağlantı Başarılı</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:48px;max-width:480px;text-align:center}
.icon{width:64px;height:64px;background:#f0fdf4;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:32px}
h1{color:#166534;font-size:24px;margin-bottom:8px}p{color:#6b7280;font-size:14px;line-height:1.6;margin-bottom:24px}
.btn{display:inline-block;background:#1f2937;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px}</style></head>
<body><div class="card">
<div class="icon">✅</div>
<h1>Bağlantı Başarılı!</h1>
<p><strong>${store}</strong> mağazası Tano Atelier B2B platformuna başarıyla bağlandı. Artık ürünleri aktarabilir ve stok senkronizasyonu yapabilirsiniz.</p>
<a href="${process.env.NEXT_PUBLIC_APP_URL || ""}/panel/dashboard" class="btn">Panele Git</a>
</div></body></html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bağlantı Hatası</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:48px;max-width:480px;text-align:center}
.icon{width:64px;height:64px;background:#fef2f2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:32px}
h1{color:#991b1b;font-size:24px;margin-bottom:8px}p{color:#6b7280;font-size:14px;line-height:1.6}</style></head>
<body><div class="card">
<div class="icon">❌</div>
<h1>Bağlantı Hatası</h1>
<p>${message}</p>
</div></body></html>`;
}

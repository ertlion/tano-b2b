import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, settings } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, company, phone, marketplace, ikas_token } = body;

    if (!name || !email || !password || !company || !marketplace) {
      return NextResponse.json({ error: "Tüm alanlar gerekli" }, { status: 400 });
    }

    if (!["shopify", "ikas", "tsoft", "ideasoft"].includes(marketplace)) {
      return NextResponse.json({ error: "Geçersiz platform" }, { status: 400 });
    }

    const existing = await db.query.tenants.findFirst({
      where: eq(tenants.email, email.toLowerCase().trim()),
    });

    if (existing) {
      return NextResponse.json({ error: "Bu email zaten kayıtlı" }, { status: 409 });
    }

    const hashed = await hashPassword(password);

    const [created] = await db.insert(tenants).values({
      name,
      email: email.toLowerCase().trim(),
      password: hashed,
      company,
      phone: phone || "",
      marketplace,
      isAdmin: false,
      isApproved: false,
      isActive: true,
    }).returning({ id: tenants.id });

    // If ikas token provided, save ikas credentials to the new tenant
    if (ikas_token && marketplace === "ikas") {
      try {
        const tokenData = JSON.parse(
          Buffer.from(ikas_token.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
        );

        // Verify token is recent (max 10 minutes)
        if (Date.now() - (tokenData.ts || 0) < 10 * 60 * 1000) {
          const ikasSettings: Record<string, string> = {
            ikas_store_url: tokenData.storeUrl || "",
            ikas_api_key: tokenData.clientId || "",
            ikas_api_secret: tokenData.clientSecret || "",
            ikas_access_token: tokenData.accessToken || "",
          };

          if (tokenData.refreshToken) {
            ikasSettings.ikas_refresh_token = tokenData.refreshToken;
          }

          for (const [key, value] of Object.entries(ikasSettings)) {
            if (value) {
              await db.insert(settings).values({
                tenantId: created.id,
                key,
                value,
              });
            }
          }
        }
      } catch (err) {
        console.error("[REGISTER] Failed to save ikas token:", err);
        // Don't fail registration, just log
      }
    }

    return NextResponse.json({
      success: true,
      message: "Kayıt başarılı. Admin onayı bekleniyor.",
      tenantId: created.id,
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, createSessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email ve şifre gerekli" }, { status: 400 });
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.email, email.toLowerCase().trim()),
    });

    if (!tenant) {
      return NextResponse.json({ error: "Geçersiz email veya şifre" }, { status: 401 });
    }

    if (!tenant.isActive) {
      return NextResponse.json({ error: "Hesap devre dışı" }, { status: 403 });
    }

    const valid = await verifyPassword(password, tenant.password);
    if (!valid) {
      return NextResponse.json({ error: "Geçersiz email veya şifre" }, { status: 401 });
    }

    if (!tenant.isApproved && !tenant.isAdmin) {
      return NextResponse.json({ error: "Hesabınız henüz onaylanmadı" }, { status: 403 });
    }

    const token = createSessionToken(tenant.id);

    const response = NextResponse.json({
      success: true,
      user: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        company: tenant.company,
        isAdmin: tenant.isAdmin,
        marketplace: tenant.marketplace,
      },
    });

    const isHttps = request.nextUrl.protocol === "https:";
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

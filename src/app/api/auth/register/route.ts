import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { name, email, password, company, phone, marketplace } = await request.json();

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

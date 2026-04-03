import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim() || "all";

    const conditions = [];

    if (status === "pending") {
      conditions.push(eq(tenants.isApproved, false));
      conditions.push(eq(tenants.isAdmin, false));
    } else if (status === "approved") {
      conditions.push(eq(tenants.isApproved, true));
      conditions.push(eq(tenants.isAdmin, false));
    }

    // Always exclude admin accounts from bayi list
    if (status === "all") {
      conditions.push(eq(tenants.isAdmin, false));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const allTenants = await db.query.tenants.findMany({
      where,
      columns: {
        id: true,
        name: true,
        email: true,
        company: true,
        phone: true,
        marketplace: true,
        isAdmin: true,
        isApproved: true,
        isActive: true,
        discountRate: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        // password excluded
      },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    return NextResponse.json({ success: true, data: allTenants });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/TENANTS] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const { name, email, password, company, phone, marketplace, notes } = body;

    // Validate required fields
    if (!name || !email || !password || !company || !phone || !marketplace) {
      return NextResponse.json(
        { error: "name, email, password, company, phone, marketplace alanlari zorunlu" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existing = await db.query.tenants.findFirst({
      where: eq(tenants.email, email.toLowerCase().trim()),
    });

    if (existing) {
      return NextResponse.json(
        { error: "Bu email adresi zaten kayitli" },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(password);

    const [newTenant] = await db
      .insert(tenants)
      .values({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        company: company.trim(),
        phone: phone.trim(),
        marketplace: marketplace.trim(),
        isAdmin: false,
        isApproved: true, // Admin creates = auto-approved
        isActive: true,
        notes: notes?.trim() || null,
      })
      .returning({
        id: tenants.id,
        name: tenants.name,
        email: tenants.email,
        company: tenants.company,
        phone: tenants.phone,
        marketplace: tenants.marketplace,
        isApproved: tenants.isApproved,
        isActive: tenants.isActive,
        createdAt: tenants.createdAt,
      });

    return NextResponse.json({ success: true, data: newTenant }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/TENANTS] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

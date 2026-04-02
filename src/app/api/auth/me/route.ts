import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSessionFromCookie, SESSION_COOKIE } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const session = getSessionFromCookie(cookie);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, session.tenantId),
    columns: {
      id: true, name: true, email: true, company: true,
      isAdmin: true, isApproved: true, isActive: true, marketplace: true,
    },
  });

  if (!tenant || !tenant.isActive) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user: tenant });
}

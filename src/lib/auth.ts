import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { tenants } from "./schema";
import { eq } from "drizzle-orm";

const SESSION_COOKIE = "tano_session";
const SESSION_SECRET = process.env.SESSION_SECRET || "default-secret-change-me";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

interface SessionPayload {
  tenantId: number;
  exp: number;
}

function encodeSession(payload: SessionPayload): string {
  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString("base64");
  const signature = Buffer.from(`${encoded}.${SESSION_SECRET}`).toString("base64");
  return `${encoded}.${signature}`;
}

function decodeSession(token: string): SessionPayload | null {
  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return null;
    const expectedSig = Buffer.from(`${encoded}.${SESSION_SECRET}`).toString("base64");
    if (signature !== expectedSig) return null;
    const data = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8")) as SessionPayload;
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function createSessionToken(tenantId: number): string {
  return encodeSession({ tenantId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
}

export function getSessionFromCookie(cookieValue: string | undefined): SessionPayload | null {
  if (!cookieValue) return null;
  return decodeSession(cookieValue);
}

// Find tenant by ID (reusable)
async function findTenantById(tenantId: number) {
  return db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: {
      id: true, name: true, email: true, company: true,
      isAdmin: true, isApproved: true, isActive: true, marketplace: true,
    },
  });
}

// API route middleware: require authenticated user
export async function requireAuth(request: NextRequest): Promise<number> {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const session = getSessionFromCookie(cookie);
  if (!session) throw new Response("Unauthorized", { status: 401 });

  const tenant = await findTenantById(session.tenantId);
  if (!tenant || !tenant.isActive) throw new Response("Account disabled", { status: 403 });
  if (!tenant.isApproved && !tenant.isAdmin) throw new Response("Account pending approval", { status: 403 });

  return session.tenantId;
}

// API route middleware: require admin
export async function requireAdmin(request: NextRequest): Promise<number> {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const session = getSessionFromCookie(cookie);
  if (!session) throw new Response("Unauthorized", { status: 401 });

  const tenant = await findTenantById(session.tenantId);
  if (!tenant || !tenant.isActive) throw new Response("Account disabled", { status: 403 });
  if (!tenant.isAdmin) throw new Response("Admin access required", { status: 403 });

  return session.tenantId;
}

// Server component session
export interface ServerSession {
  tenantId: number;
  tenant: {
    id: number;
    name: string;
    email: string;
    company: string;
    isAdmin: boolean;
    isApproved: boolean;
    marketplace: string;
  };
}

export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE)?.value;
  const session = getSessionFromCookie(cookie);
  if (!session) return null;

  const tenant = await findTenantById(session.tenantId);
  if (!tenant || !tenant.isActive) return null;

  return {
    tenantId: tenant.id,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      company: tenant.company,
      isAdmin: tenant.isAdmin,
      isApproved: tenant.isApproved,
      marketplace: tenant.marketplace,
    },
  };
}

export { SESSION_COOKIE };

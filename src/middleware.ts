import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "tano_session";

const PUBLIC_PATHS = ["/login", "/register"];
const WEBHOOK_PREFIX = "/api/webhooks/";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static files and Next.js internals: pass through
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Webhook endpoints: no auth required (external platforms call these)
  if (pathname.startsWith(WEBHOOK_PREFIX)) {
    return NextResponse.next();
  }

  // API routes for admin/panel: let API handlers do their own auth
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const hasCookie = request.cookies.has(SESSION_COOKIE);

  // Public pages: if already logged in, redirect to panel
  if (PUBLIC_PATHS.some((p) => pathname === p)) {
    if (hasCookie) {
      return NextResponse.redirect(new URL("/panel", request.url));
    }
    return NextResponse.next();
  }

  // Protected routes: /admin/* and /panel/*
  if (pathname.startsWith("/admin") || pathname.startsWith("/panel")) {
    if (!hasCookie) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static
     * - _next/image
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

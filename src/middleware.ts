import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "tano_session";

const PUBLIC_PATHS = ["/login", "/register"];
const WEBHOOK_PREFIX = "/api/webhooks/";

function withIframeHeaders(response: NextResponse): NextResponse {
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://*.myikas.com https://admin.myikas.com"
  );
  response.headers.delete("X-Frame-Options");
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return withIframeHeaders(NextResponse.next());
  }

  // Webhook endpoints: no auth
  if (pathname.startsWith(WEBHOOK_PREFIX)) {
    return withIframeHeaders(NextResponse.next());
  }

  // API routes: let handlers do their own auth
  if (pathname.startsWith("/api/")) {
    return withIframeHeaders(NextResponse.next());
  }

  const hasCookie = request.cookies.has(SESSION_COOKIE);

  // Public pages: if logged in, redirect to dashboard
  if (PUBLIC_PATHS.some((p) => pathname === p)) {
    if (hasCookie) {
      return withIframeHeaders(NextResponse.redirect(new URL("/panel/dashboard", request.url)));
    }
    return withIframeHeaders(NextResponse.next());
  }

  // Protected routes
  if (pathname.startsWith("/admin") || pathname.startsWith("/panel")) {
    if (!hasCookie) {
      return withIframeHeaders(NextResponse.redirect(new URL("/login", request.url)));
    }
    return withIframeHeaders(NextResponse.next());
  }

  return withIframeHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

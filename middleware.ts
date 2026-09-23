import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["boardcue_session", "voxboard_session"];
const PROTECTED = ["/app", "/account", "/admin", "/workspaces"];
const ENGLISH_PAGES = ["", "/pricing", "/demo", "/privacy", "/terms", "/cookies", "/subprocessors", "/ai-literacy", "/login", "/register"];

/**
 * 1. English public pages live under /en (SEO): rewritten to the same routes with an explicit locale header.
 * 2. Private areas require a session cookie; the page itself still validates the session in the database.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const rest = pathname.slice(3);
    if (!ENGLISH_PAGES.includes(rest)) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = rest || "/";
    const headers = new Headers(request.headers);
    headers.set("x-boardcue-locale", "en");
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (PROTECTED.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    if (!SESSION_COOKIES.some(name => request.cookies.get(name)?.value)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/en",
    "/en/:path*",
    "/app/:path*",
    "/app",
    "/account/:path*",
    "/account",
    "/admin/:path*",
    "/admin",
    "/workspaces/:path*",
    "/workspaces",
  ],
};

import { NextResponse, type NextRequest } from "next/server";
import { ENGLISH_PAGES } from "@/lib/i18n/routes";

const SESSION_COOKIES = ["boardcue_session", "voxboard_session"];
const PROTECTED = ["/app", "/account", "/admin", "/workspaces"];

/**
 * 1. English public pages live under /en (SEO): rewritten to the same routes with an explicit locale header.
 * 2. Private areas require a session cookie; the page itself still validates the session in the database.
 */
export function middleware(request: NextRequest) {
  // Reject malformed action headers before Next's action decoder logs an exception.
  const actionId = request.headers.get("next-action");
  if (request.method === "POST" && actionId !== null && !/^[a-f0-9]{42}$/i.test(actionId)) {
    return new NextResponse(null, { status: 400 });
  }
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
      if (pathname === "/app" && request.nextUrl.searchParams.get("shared") === "1") {
        url.pathname = "/login";
        url.search = `?next=${encodeURIComponent("/app?shared=1")}`;
        return NextResponse.redirect(url);
      }
      // Old bookmarks and installed apps may still open the generic app entry.
      url.pathname = pathname === "/app" ? "/" : "/login";
      url.search = pathname === "/app" ? "" : `?next=${encodeURIComponent(`${pathname}${search}`)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    { source: "/:path*", has: [{ type: "header", key: "next-action" }] },
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

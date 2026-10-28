/** No forwarded or Host header is a source of authority for browser mutations. */
export function trustedRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return !["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") || "");
  try {
    const expected = new URL(process.env.APP_URL || (process.env.NODE_ENV !== "production" ? request.url : "https://boardcue.draftapps.it")).origin;
    return new URL(origin).origin === origin && origin === expected;
  } catch { return false; }
}

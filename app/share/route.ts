/** Installed PWAs handle shared files in the service worker; this is a safe fallback. */
export async function POST(request: Request) {
  return Response.redirect(new URL("/app?shareError=1", request.url), 303);
}

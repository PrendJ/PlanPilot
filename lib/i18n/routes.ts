/** Public pages that also exist in English under /en (rewritten by the middleware with an explicit locale). */
export const ENGLISH_PAGES = [
  "",
  "/pricing",
  "/demo",
  "/privacy",
  "/terms",
  "/cookies",
  "/subprocessors",
  "/ai-literacy",
  "/login",
  "/register",
];

/** The same page in the other language, when it has a localized address; null keeps the current address. */
export function localizedPath(pathname: string, locale: "it" | "en") {
  const base = pathname.replace(/^\/en(?=\/|$)/, "");
  const page = base === "/" ? "" : base;
  if (!ENGLISH_PAGES.includes(page)) return null;
  return locale === "en" ? `/en${page}` : page || "/";
}

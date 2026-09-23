import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, LOCALE_HEADER, localeFromAcceptLanguage, normalizeUiLocale, translator, type UiLocale } from "./core";

/** Order: explicit /en route → saved preference → account language → browser → Italian. */
export async function getLocale(userLocale?: string | null): Promise<UiLocale> {
  const headerList = await headers();
  const routed = headerList.get(LOCALE_HEADER);
  if (routed) return normalizeUiLocale(routed);
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (saved) return normalizeUiLocale(saved);
  if (userLocale) return normalizeUiLocale(userLocale);
  return localeFromAcceptLanguage(headerList.get("accept-language")) || "it";
}

export async function getTranslator(userLocale?: string | null) {
  const locale = await getLocale(userLocale);
  return { locale, t: translator(locale) };
}

/** For route handlers: the request carries the same signals as the page. */
export function requestLocale(request: Request): UiLocale {
  const routed = request.headers.get(LOCALE_HEADER);
  if (routed) return normalizeUiLocale(routed);
  const cookie = request.headers.get("cookie")?.match(new RegExp(`${LOCALE_COOKIE}=([a-z]{2})`))?.[1];
  if (cookie) return normalizeUiLocale(cookie);
  return localeFromAcceptLanguage(request.headers.get("accept-language")) || "it";
}

import type { Metadata } from "next";
import type { UiLocale } from "@/lib/i18n/core";

const SOCIAL_IMAGE = "/opengraph-image";
export const DEFAULT_SITE_URL = "https://boardcue.draftapps.it";

/** Public origin without a trailing slash. Read at request time: APP_URL differs between staging and production. */
export function siteUrl() {
  return (process.env.APP_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

/** Address of a public page in one language: Italian lives at the root, English under /en. `path` is "" for the home. */
export function localizedHref(path: string, locale: UiLocale) {
  if (locale === "en") return `/en${path}`;
  return path || "/";
}

/**
 * Canonical + hreflang for a public page. `translated` is false for pages that only exist in Italian
 * (legal texts): /en/privacy renders the same Italian text, so it must point to the Italian address and
 * must not advertise an English alternate.
 */
export function pageAlternates(path: string, locale: UiLocale, translated = true): NonNullable<Metadata["alternates"]> {
  const canonical = translated ? localizedHref(path, locale) : localizedHref(path, "it");
  if (!translated) return { canonical };
  return {
    canonical,
    languages: { "it-IT": localizedHref(path, "it"), "en-GB": localizedHref(path, "en"), "x-default": localizedHref(path, "it") },
  };
}

type PublicMetadataInput = {
  path: string;
  locale: UiLocale;
  title: string;
  description: string;
  /** Use the bare title instead of "title · BoardCue". */
  absoluteTitle?: boolean;
};

/** Title, description, canonical, hreflang, Open Graph and Twitter tags for an indexable translated page. */
export function publicMetadata({ path, locale, title, description, absoluteTitle }: PublicMetadataInput): Metadata {
  const url = localizedHref(path, locale);
  const fullTitle = absoluteTitle ? title : `${title} · BoardCue`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: pageAlternates(path, locale),
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: "BoardCue",
      type: "website",
      locale: locale === "en" ? "en_GB" : "it_IT",
      alternateLocale: locale === "en" ? "it_IT" : "en_GB",
      // A page-level openGraph replaces the layout's, so the shared card is repeated here.
      images: [{ url: SOCIAL_IMAGE, width: 1200, height: 630, alt: "BoardCue" }],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [SOCIAL_IMAGE] },
  };
}

/** Pages that must stay out of the index but whose links may still be followed. */
export const NOINDEX: NonNullable<Metadata["robots"]> = { index: false, follow: true };

/** Private areas and machine endpoints: never crawled, never indexed (robots.txt and X-Robots-Tag). */
export const PRIVATE_PATHS = [
  "/api/",
  "/app",
  "/account",
  "/admin",
  "/workspaces",
  "/share",
  "/accept-invite",
  "/reset-password",
  "/forgot-password",
] as const;

/** Public pages that exist in both languages (the others are Italian only). Login and register are not listed: login is noindex. */
export const SITEMAP_TRANSLATED_PAGES = ["", "/pricing", "/demo", "/register"] as const;
export const SITEMAP_ITALIAN_ONLY_PAGES = ["/privacy", "/terms", "/cookies", "/ai-literacy"] as const;

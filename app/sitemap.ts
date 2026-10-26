import type { MetadataRoute } from "next";
import { SITEMAP_ITALIAN_ONLY_PAGES, SITEMAP_TRANSLATED_PAGES, localizedHref, siteUrl } from "@/lib/seo";

// Read APP_URL at request time, not at build time.
export const dynamic = "force-dynamic";

const PRIORITY: Record<string, number> = { "": 1, "/pricing": 0.9, "/demo": 0.8, "/register": 0.6 };

/** Every public, indexable page once per language, each linked to its translation (hreflang). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const translated = SITEMAP_TRANSLATED_PAGES.flatMap(path => {
    const alternates = {
      languages: {
        "it-IT": `${base}${localizedHref(path, "it")}`,
        "en-GB": `${base}${localizedHref(path, "en")}`,
        "x-default": `${base}${localizedHref(path, "it")}`,
      },
    };
    return (["it", "en"] as const).map(locale => ({
      url: `${base}${localizedHref(path, locale)}`,
      changeFrequency: path === "" || path === "/pricing" ? ("weekly" as const) : ("monthly" as const),
      priority: PRIORITY[path] ?? 0.5,
      alternates,
    }));
  });
  const legal = SITEMAP_ITALIAN_ONLY_PAGES.map(path => ({
    url: `${base}${path}`,
    changeFrequency: "yearly" as const,
    priority: 0.3,
  }));
  return [...translated, ...legal];
}

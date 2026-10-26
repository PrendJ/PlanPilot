import { afterEach, describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { buildLlmsTxt } from "@/lib/llms";
import { PRIVATE_PATHS, pageAlternates, publicMetadata, siteUrl } from "@/lib/seo";
import { landingStructuredData } from "@/lib/structured-data";
import { translator } from "@/lib/i18n/core";
import { ENGLISH_PAGES } from "@/lib/i18n/routes";

const original = process.env.APP_URL;
afterEach(() => {
  if (original === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = original;
});

describe("canonical and hreflang", () => {
  it("points each language to its own address and advertises the translation", () => {
    expect(pageAlternates("/pricing", "it")).toEqual({
      canonical: "/pricing",
      languages: { "it-IT": "/pricing", "en-GB": "/en/pricing", "x-default": "/pricing" },
    });
    expect(pageAlternates("", "en").canonical).toBe("/en");
    expect(pageAlternates("", "it").canonical).toBe("/");
  });
  it("sends the English copy of an Italian-only page to the Italian address", () => {
    expect(pageAlternates("/privacy", "en", false)).toEqual({ canonical: "/privacy" });
  });
  it("builds Open Graph tags in the page language", () => {
    const meta = publicMetadata({ path: "/demo", locale: "en", title: "Demo", description: "d" });
    expect(meta.openGraph).toMatchObject({ url: "/en/demo", locale: "en_GB", title: "Demo · BoardCue" });
  });
});

describe("robots.txt and sitemap", () => {
  it("hides private areas from every crawler and names the sitemap", () => {
    process.env.APP_URL = "https://example.test/";
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(result.sitemap).toBe("https://example.test/sitemap.xml");
    expect(rules.length).toBeGreaterThan(1);
    for (const rule of rules) {
      expect(rule.allow).toBe("/");
      expect(rule.disallow).toEqual([...PRIVATE_PATHS]);
    }
    expect(rules.map(rule => rule.userAgent)).toEqual(expect.arrayContaining(["*", "GPTBot", "ClaudeBot", "PerplexityBot"]));
  });
  it("lists only public pages, each translated page in both languages, all inside /en routing", () => {
    process.env.APP_URL = "https://example.test";
    const urls = sitemap().map(entry => entry.url);
    expect(urls).toContain("https://example.test/");
    expect(urls).toContain("https://example.test/en/pricing");
    expect(urls).not.toContain("https://example.test/en/privacy");
    expect(urls.some(url => /\/(app|api|admin|account|login)/.test(url.replace("https://example.test", "")))).toBe(false);
    for (const url of urls) {
      const path = url.replace("https://example.test", "").replace(/^\/en/, "");
      expect(ENGLISH_PAGES.concat("/")).toContain(path === "/" ? "/" : path);
    }
  });
});

describe("structured data and llms.txt", () => {
  it("publishes the real catalogue prices, VAT included only for private plans", () => {
    const graph = landingStructuredData(translator("it"), "it")["@graph"] as Array<Record<string, any>>;
    const offers = graph.find(node => node["@type"] === "SoftwareApplication")!.offers as Array<Record<string, any>>;
    const price = (name: string) => offers.find(offer => offer.name === name)!.priceSpecification;
    expect(price("Pro personale")).toMatchObject({ price: "4.90", valueAddedTaxIncluded: true });
    expect(price("Team")).toMatchObject({ price: "6.00", valueAddedTaxIncluded: false });
    expect(graph.find(node => node["@type"] === "FAQPage")!.mainEntity).toHaveLength(6);
  });
  it("summarises the product in both languages with absolute links", () => {
    process.env.APP_URL = "https://example.test";
    const text = buildLlmsTxt();
    expect(text.startsWith("# BoardCue")).toBe(true);
    expect(text).toContain("https://example.test/en/pricing");
    expect(text).toContain("€4.90");
    expect(siteUrl()).toBe("https://example.test");
  });
});

import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, siteUrl } from "@/lib/seo";

// Read APP_URL at request time, not at build time.
export const dynamic = "force-dynamic";

/** Search and answer-engine crawlers named explicitly so a later blanket rule cannot shut them out by accident. */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  const rule = { allow: "/", disallow: [...PRIVATE_PATHS] };
  return {
    rules: [{ userAgent: "*", ...rule }, ...AI_CRAWLERS.map(userAgent => ({ userAgent, ...rule }))],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

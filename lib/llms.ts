import { translator, type UiLocale } from "@/lib/i18n/core";
import { PLANS, SELLABLE_PLAN_KEYS, TRIAL_DAYS, planPriceCents, type SellablePlanKey } from "@/lib/plans";
import { localizedHref, siteUrl } from "@/lib/seo";
import { FAQ_KEYS, priceNumber } from "@/lib/structured-data";

const CONSUMER_PLANS: readonly SellablePlanKey[] = ["PERSONAL_PRO", "FAMILY"];
const FEATURE_KEYS = ["dictation", "preview", "today", "channels", "views", "import"] as const;
const HEADINGS = {
  it: {
    pages: "Pagine principali",
    features: "Cosa fa",
    pricing: "Prezzi (al mese)",
    vatIncluded: "IVA inclusa",
    vatExcluded: "IVA esclusa",
    perSeat: "per persona",
    faq: "Domande frequenti",
    legal: "Informazioni legali",
    home: "Home",
    demo: "Demo interattiva",
    pricingPage: "Prezzi",
    register: "Registrazione e prova gratuita",
  },
  en: {
    pages: "Main pages",
    features: "What it does",
    pricing: "Pricing (per month)",
    vatIncluded: "VAT included",
    vatExcluded: "VAT excluded",
    perSeat: "per person",
    faq: "Frequently asked questions",
    legal: "Legal information (Italian only)",
    home: "Home",
    demo: "Interactive demo",
    pricingPage: "Pricing",
    register: "Sign up and free trial",
  },
} as const;

function section(locale: UiLocale) {
  const t = translator(locale);
  const h = HEADINGS[locale];
  const base = siteUrl();
  const link = (path: string) => `${base}${localizedHref(path, locale)}`;
  const price = (key: SellablePlanKey) => {
    const consumer = CONSUMER_PLANS.includes(key);
    const cents = planPriceCents(key, "month", consumer ? "consumer" : "business");
    const seat = PLANS[key].seatBased ? ` ${h.perSeat}` : "";
    return `- ${t(`plans.${key}`)}: €${priceNumber(cents)}${seat}, ${consumer ? h.vatIncluded : h.vatExcluded}. ${t(`pricing.audience.${key}`)}`;
  };
  return [
    `## ${locale === "it" ? "Italiano" : "English"}`,
    "",
    t("meta.description"),
    "",
    t("landing.lead"),
    "",
    `### ${h.pages}`,
    `- [${h.home}](${link("")}): ${t("landing.title")}`,
    `- [${h.demo}](${link("/demo")}): ${t("demo.subtitle")}`,
    `- [${h.pricingPage}](${link("/pricing")}): ${t("pricing.subtitle", { days: TRIAL_DAYS })}`,
    `- [${h.register}](${link("/register")}): ${t("auth.register.subtitle", { days: TRIAL_DAYS })}`,
    "",
    `### ${h.features}`,
    ...FEATURE_KEYS.map(key => `- **${t(`landing.features.${key}.title`)}**: ${t(`landing.features.${key}.body`)}`),
    "",
    `### ${h.pricing}`,
    `- ${t("plans.TRIAL")}: €0, ${TRIAL_DAYS} ${locale === "it" ? "giorni, senza carta di credito" : "days, no credit card"}`,
    ...SELLABLE_PLAN_KEYS.map(price),
    "",
    `### ${h.faq}`,
    ...FAQ_KEYS.flatMap(key => [`**${t(`faq.${key}.q`)}**`, t(`faq.${key}.a`, { days: TRIAL_DAYS }), ""]),
  ];
}

/**
 * llms.txt (llmstxt.org): a plain-markdown summary for AI assistants and answer engines. It is generated from the
 * same translations, plan catalogue and prices the site renders, so it cannot drift from the pricing page.
 */
export function buildLlmsTxt() {
  const base = siteUrl();
  const it = translator("it");
  return [
    "# BoardCue",
    "",
    `> ${it("meta.description")}`,
    `> ${translator("en")("meta.description")}`,
    "",
    "BoardCue is an AI-assisted work organizer. Users speak or write free-form thoughts; BoardCue proposes precise actions (create, update, move, archive cards) on boards and shows what to do today. Every change is previewed and confirmed by the user before it is applied. Interface in Italian and English; boards, dictation and AI work in Italian, English, German, French, Spanish, Russian and Polish. Published by Draftapps (Italy).",
    "",
    ...section("it"),
    ...section("en"),
    "## Legal / Informazioni legali",
    `- [Privacy Policy](${base}/privacy)`,
    `- [Terms / Termini di servizio](${base}/terms)`,
    `- [Cookie Policy](${base}/cookies)`,
    `- [AI guide / Guida AI](${base}/ai-literacy)`,
    "",
  ].join("\n");
}

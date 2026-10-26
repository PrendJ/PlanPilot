import type { Translate, UiLocale } from "@/lib/i18n/core";
import { SELLABLE_PLAN_KEYS, TRIAL_DAYS, planPriceCents, type SellablePlanKey } from "@/lib/plans";
import { localizedHref, siteUrl } from "@/lib/seo";

export const FAQ_KEYS = ["update", "dictation", "privacy", "trial", "frozen", "languages"] as const;
const CONSUMER_PLANS: readonly SellablePlanKey[] = ["PERSONAL_PRO", "FAMILY"];

/** "4.90": schema.org wants a dot as decimal separator, whatever the page language. */
export function priceNumber(cents: number) {
  return (cents / 100).toFixed(2);
}

/** Entity that runs the service, as published in the legal footer (env) with the product owner as fallback. */
function publisher() {
  return {
    "@type": "Organization",
    "@id": `${siteUrl()}/#publisher`,
    name: process.env.LEGAL_ENTITY_NAME || "Draftapps",
    url: "https://draftapps.it",
  };
}

/** Private plans are priced VAT included, business plans VAT excluded: the same figures the pricing page shows. */
function offers(t: Translate, locale: UiLocale) {
  const url = `${siteUrl()}${localizedHref("/pricing", locale)}`;
  const trial = {
    "@type": "Offer",
    name: t("plans.TRIAL"),
    price: "0",
    priceCurrency: "EUR",
    description: t("faq.trial.a", { days: TRIAL_DAYS }),
    url,
    availability: "https://schema.org/InStock",
  };
  const paid = SELLABLE_PLAN_KEYS.map(key => {
    const consumer = CONSUMER_PLANS.includes(key);
    const cents = planPriceCents(key, "month", consumer ? "consumer" : "business");
    return {
      "@type": "Offer",
      name: t(`plans.${key}`),
      description: t(`pricing.audience.${key}`),
      price: priceNumber(cents),
      priceCurrency: "EUR",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: priceNumber(cents),
        priceCurrency: "EUR",
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: "MON",
        valueAddedTaxIncluded: consumer,
      },
      url,
      availability: "https://schema.org/InStock",
    };
  });
  return [trial, ...paid];
}

/** Landing page graph: who publishes BoardCue, what the product is and what it costs, and the FAQ answers verbatim. */
export function landingStructuredData(t: Translate, locale: UiLocale) {
  const base = siteUrl();
  const home = `${base}${localizedHref("", locale)}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      publisher(),
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        url: home,
        name: "BoardCue",
        description: t("meta.description"),
        inLanguage: locale === "en" ? "en-GB" : "it-IT",
        publisher: { "@id": `${base}/#publisher` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${base}/#software`,
        name: "BoardCue",
        url: home,
        description: t("meta.description"),
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Task management",
        operatingSystem: "Web, iOS, Android (PWA)",
        inLanguage: ["it", "en", "de", "fr", "es", "ru", "pl"],
        isAccessibleForFree: false,
        featureList: (["dictation", "preview", "today", "channels", "views", "import"] as const).map(key => t(`landing.features.${key}.title`)),
        publisher: { "@id": `${base}/#publisher` },
        offers: offers(t, locale),
      },
      {
        "@type": "FAQPage",
        "@id": `${home}#faq`,
        inLanguage: locale === "en" ? "en-GB" : "it-IT",
        mainEntity: FAQ_KEYS.map(key => ({
          "@type": "Question",
          name: t(`faq.${key}.q`),
          acceptedAnswer: { "@type": "Answer", text: t(`faq.${key}.a`, { days: TRIAL_DAYS }) },
        })),
      },
    ],
  };
}

import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CREDIT_PACK, PLANS, SELLABLE_PLAN_KEYS, TRIAL_DAYS, creditPackPriceCents, planPriceCents } from "@/lib/plans";
import { getTranslator } from "@/lib/i18n/server";
import { Topbar } from "@/components/Topbar";
import { PublicFooter } from "@/components/PublicFooter";
import { PricingTable } from "@/components/PricingTable";
import { EnterpriseForm } from "@/components/PricingActions";
import { Icon } from "@/components/Icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pricing.title"), description: t("pricing.subtitle", { days: TRIAL_DAYS }), alternates: { canonical: "/pricing" } };
}

export default async function Pricing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const value = (key: string) => (Array.isArray(query[key]) ? query[key]![0] : query[key]);
  const user = await getCurrentUser();
  const { t } = await getTranslator(user?.locale);
  // Checkout applies to the team currently selected in the header (the default organization) when the user owns it.
  const owned = user
    ? ((await prisma.organizationMember.findFirst({
        where: { userId: user.id, role: "OWNER", ...(user.defaultOrganizationId ? { organizationId: user.defaultOrganizationId } : {}) },
        select: { organizationId: true },
      })) ?? (await prisma.organizationMember.findFirst({ where: { userId: user.id, role: "OWNER" }, select: { organizationId: true } })))
    : null;
  const plans = SELLABLE_PLAN_KEYS.map(key => ({
    key,
    priceEur: PLANS[key].priceEur!,
    priceEurYearly: PLANS[key].priceEurYearly!,
    seatBased: PLANS[key].seatBased,
    minSeats: PLANS[key].minSeats,
    aiUpdates: PLANS[key].aiUpdates,
    consumerPriceEur: planPriceCents(key, "month", "consumer") / 100,
    consumerPriceEurYearly: planPriceCents(key, "year", "consumer") / 100,
  }));
  const highlight = SELLABLE_PLAN_KEYS.find(key => key === value("plan"));
  const faqs = ["update", "trial", "frozen", "dictation", "privacy", "seats", "invoice", "cancel"] as const;
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="container marketing">
        <section className="section-heading centered" style={{ paddingTop: 48 }}>
          <span className="eyebrow">{t("nav.pricing")}</span>
          <h1>{t("pricing.title")}</h1>
          <p>{t("pricing.subtitle", { days: TRIAL_DAYS })}</p>
        </section>
        {value("checkout") === "cancelled" && (
          <div className="notice warning" role="status" style={{ marginBottom: 16 }}>
            <Icon name="info" />
            <div className="notice-body">{t("pricing.cancelled")}</div>
          </div>
        )}
        <PricingTable
          plans={plans}
          organizationId={owned?.organizationId ?? null}
          highlight={highlight}
          trialDays={TRIAL_DAYS}
          verified={Boolean(user?.emailVerifiedAt)}
        />
        <section className="pricing-extra">
          <div className="panel">
            <h3>
              <Icon name="zap" size={16} /> {t("pricing.packTitle")}
            </h3>
            <p className="subtle">
              {t("pricing.packBody", {
                units: CREDIT_PACK.units,
                price: CREDIT_PACK.priceEur,
                consumerPrice: (creditPackPriceCents("consumer") / 100).toFixed(2).replace(".", ","),
              })}
            </p>
          </div>
          <div className="panel">
            <h3>
              <Icon name="lock" size={16} /> {t("pricing.frozenTitle")}
            </h3>
            <p className="subtle">{t("pricing.frozenBody")}</p>
          </div>
          <div className="panel">
            <h3>
              <Icon name="globe" size={16} /> {t("pricing.euTitle")}
            </h3>
            <p className="subtle">{t("pricing.euBody")}</p>
          </div>
        </section>
        <section className="enterprise-band" id="enterprise">
          <div>
            <span className="eyebrow">{t("plans.ENTERPRISE")}</span>
            <h2>{t("pricing.enterprise.title")}</h2>
            <p className="subtle">{t("pricing.enterprise.body")}</p>
            <ul className="check-list">
              {(["volume", "quotas", "invoice", "onboarding"] as const).map(key => (
                <li key={key}>
                  <Icon name="check" size={15} />
                  {t(`pricing.enterprise.points.${key}`)}
                </li>
              ))}
            </ul>
          </div>
          <EnterpriseForm />
        </section>
        <section className="faq" aria-labelledby="faq-title">
          <h2 id="faq-title">{t("faq.title")}</h2>
          {faqs.map(key => (
            <details key={key}>
              <summary>{t(`faq.${key}.q`)}</summary>
              <p>{t(`faq.${key}.a`, { days: TRIAL_DAYS })}</p>
            </details>
          ))}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

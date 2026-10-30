"use client";

import { seatTotalCents, type SeatTier } from "@/lib/seat-pricing";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { api, useFeedback } from "./ui";
import type { SellablePlanKey } from "@/lib/plans";

type Plan = {
  tiers: Record<"consumer" | "business", Record<"month" | "year", SeatTier[]>>;
  key: SellablePlanKey;
  priceEur: number;
  priceEurYearly: number;
  seatBased: boolean;
  minSeats: number;
  aiUpdates: number;
  /** Null = unlimited boards. */
  boardsPerPerson: number | null;
  historyMonths: number;
  boardSoftLimitPerPerson: number | null;
  consumerPriceEur: number;
  consumerPriceEurYearly: number;
};

/**
 * Plan cards with monthly/annual switch, business/private switch and seat selection. Businesses see prices
 * VAT excluded; private customers see the VAT-inclusive price they will pay. Checkout goes straight to Stripe.
 */
export function PricingTable({
  plans,
  canPurchase = true,
  organizationId,
  highlight,
  trialDays,
  verified,
  initialCustomerType = "consumer",
  businessContact,
}: {
  plans: Plan[];
  canPurchase?: boolean;
  organizationId: string | null;
  highlight?: string;
  trialDays: number;
  verified: boolean;
  initialCustomerType?: "business" | "consumer";
  /** Business is sold on contact: the form shows only with the business plans. */
  businessContact?: React.ReactNode;
}) {
  const { t, tag } = useI18n();
  const { toast } = useFeedback();
  const euro = (value: number) => new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [customerType, setCustomerType] = useState<"business" | "consumer">(initialCustomerType);
  const consumer = customerType === "consumer";
  const [seats, setSeats] = useState<Record<string, number>>({ FAMILY: 2, TEAM: 3, BUSINESS: 5 });
  const [busy, setBusy] = useState("");

  async function checkout(plan: Plan) {
    if (!organizationId) {
      location.href = `/register?plan=${plan.key}`;
      return;
    }
    if (!verified) {
      toast({ message: t("errors.EMAIL_NOT_VERIFIED"), tone: "error" });
      return;
    }
    setBusy(plan.key);
    const response = await api<{ url: string }>("/api/billing/checkout", {
      method: "POST",
      json: { organizationId, plan: plan.key, interval, customerType, seats: plan.seatBased ? seats[plan.key] : undefined },
    });
    setBusy("");
    if (response.ok && response.data.url) location.href = response.data.url;
    else toast({ message: response.data.error || t("errors.BILLING_UNAVAILABLE"), tone: "error" });
  }

  const limitsOf = (key: Plan["key"]) => {
    const plan = plans.find(item => item.key === key)!;
    return [
      plan.boardsPerPerson === null
        ? t("pricing.features.boardsUnlimited")
        : t(plan.seatBased ? "pricing.features.boardsPerSeat" : "pricing.features.boards", { count: plan.boardsPerPerson }),
      ...(plan.boardSoftLimitPerPerson
        ? [
            tag.startsWith("it")
              ? `Soglia indicativa di ${plan.boardSoftLimitPerPerson} board per posto, condivisa tra i workspace; nessun blocco al superamento`
              : `${plan.boardSoftLimitPerPerson} boards per seat guideline, shared across workspaces; exceeding it does not block work`,
          ]
        : []),
      t("pricing.features.history", { months: plan.historyMonths }),
    ];
  };
  const features: Record<Plan["key"], string[]> = {
    PERSONAL_PRO: [
      ...limitsOf("PERSONAL_PRO"),
      t("pricing.features.dictation"),
      t("pricing.features.preview"),
      t("pricing.features.views"),
      t("pricing.features.export"),
      t("pricing.features.twofa"),
    ],
    FAMILY: [
      t("pricing.features.everythingProFamily"),
      ...limitsOf("FAMILY"),
      t("pricing.features.realtime"),
      t("pricing.features.comments"),
      t("pricing.features.guests"),
      t("pricing.features.pooled"),
      t("pricing.features.export"),
      t("pricing.features.twofa"),
    ],
    PRO: [
      ...limitsOf("PRO"),
      t("pricing.features.dictation"),
      t("pricing.features.preview"),
      t("pricing.features.views"),
      t("pricing.features.export"),
      t("pricing.features.twofa"),
    ],
    TEAM: [
      t("pricing.features.everythingPro"),
      ...limitsOf("TEAM"),
      t("pricing.features.realtime"),
      t("pricing.features.comments"),
      t("pricing.features.guests"),
      t("pricing.features.integrations"),
      t("pricing.features.pooled"),
    ],
    BUSINESS: [
      t("pricing.features.everythingTeam"),
      ...limitsOf("BUSINESS"),
      t("pricing.features.enforce2fa"),
      t("pricing.features.auditExport"),
      t("pricing.features.priority"),
      t("pricing.features.onboardingCall"),
    ],
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row" style={{ justifyContent: "center" }}>
        <div className="segmented" role="group" aria-label={t("pricing.customerType")}>
          <button type="button" aria-pressed={!consumer} onClick={() => setCustomerType("business")}>
            {t("pricing.business")}
          </button>
          <button type="button" aria-pressed={consumer} onClick={() => setCustomerType("consumer")}>
            {t("pricing.consumer")}
          </button>
        </div>
        <div className="segmented" role="group" aria-label={t("pricing.billing")}>
          <button type="button" aria-pressed={interval === "month"} onClick={() => setInterval("month")}>
            {t("pricing.monthly")}
          </button>
          <button type="button" aria-pressed={interval === "year"} onClick={() => setInterval("year")}>
            {t("pricing.yearly")}{" "}
            <span className="badge success" style={{ height: 18 }}>
              {t("pricing.twoMonthsFree")}
            </span>
          </button>
        </div>
      </div>
      {!canPurchase && (
        <p className="notice warning">
          {tag.startsWith("it")
            ? "L’abbonamento selezionato può essere modificato dal suo titolare. Seleziona il tuo abbonamento dal menu per acquistare."
            : "Only the selected subscription’s owner can change it. Select your own subscription from the menu to purchase."}
        </p>
      )}
      <div className={`pricing-grid ${consumer ? "two" : ""}`}>
        {plans
          .filter(plan => (consumer ? ["PERSONAL_PRO", "FAMILY"].includes(plan.key) : ["PRO", "TEAM"].includes(plan.key)))
          .map(plan => {
            const monthly = consumer ? plan.consumerPriceEur : plan.priceEur;
            const yearlyAmount = consumer ? plan.consumerPriceEurYearly : plan.priceEurYearly;
            // Annual plans show the yearly total (10 months, rounded down), never a monthly equivalent.
            const yearly = interval === "year";
            const perSeat = yearly ? yearlyAmount : monthly;
            const count = plan.seatBased ? seats[plan.key] : 1;
            const total = seatTotalCents(plan.tiers[customerType][interval], count) / 100;
            // Per seat, like the headline price; the seat picker shows the total.
            const saved = Math.round((monthly * 12 - yearlyAmount) * 100) / 100;
            const featured = (highlight || (consumer ? "FAMILY" : "TEAM")) === plan.key;
            return (
              <article key={plan.key} className={`pricing-card ${featured ? "featured" : ""}`}>
                {featured && <span className="pricing-flag">{highlight ? t("pricing.selected") : t("pricing.popular")}</span>}
                <h2>{t(`plans.${plan.key}`)}</h2>
                <p className="subtle">{t(`pricing.audience.${plan.key}`)}</p>
                <div className="price">
                  <strong>€{euro(perSeat)}</strong>
                  <span>
                    {yearly
                      ? plan.seatBased
                        ? t("pricing.perSeatYear")
                        : t("pricing.perYear")
                      : plan.seatBased
                        ? t("pricing.perSeatMonth")
                        : t("pricing.perMonth")}
                  </span>
                </div>
                <p className="subtle">
                  {yearly
                    ? t(consumer ? "pricing.yearlySavingVatIncluded" : "pricing.yearlySaving", {
                        monthly: euro(Math.round(monthly * 12 * 100) / 100),
                        saved: euro(saved),
                        per: plan.seatBased ? t("pricing.perSeatSuffix") : "",
                      })
                    : t(consumer ? "pricing.vatIncluded" : "pricing.vatExcluded")}
                </p>
                {plan.seatBased && (
                  <div className="seat-picker">
                    <span>{t("pricing.seats")}</span>
                    <button
                      type="button"
                      className="icon-btn bordered"
                      aria-label={t("pricing.lessSeats")}
                      disabled={count <= plan.minSeats}
                      onClick={() => setSeats(current => ({ ...current, [plan.key]: Math.max(plan.minSeats, count - 1) }))}
                    >
                      −
                    </button>
                    <output aria-live="polite">{count}</output>
                    <button
                      type="button"
                      className="icon-btn bordered"
                      aria-label={t("pricing.moreSeats")}
                      onClick={() => setSeats(current => ({ ...current, [plan.key]: Math.min(500, count + 1) }))}
                    >
                      +
                    </button>
                    <span className="subtle">
                      = €{euro(total)}
                      {yearly ? t("pricing.perYearShort") : t("pricing.perMonthShort")}
                    </span>
                  </div>
                )}
                {plan.seatBased && (
                  <p className="subtle">
                    {tag.startsWith("it")
                      ? `Primi 3 posti al prezzo indicato. Dal 4° il prezzo del singolo posto scende progressivamente, fino a €${euro(plan.tiers[customerType][interval].at(-1)!.cents / 100)} dal 100° posto. Il totale tiene già conto dello sconto.`
                      : `First 3 seats at the listed price. From seat 4, each additional seat progressively costs less, down to €${euro(plan.tiers[customerType][interval].at(-1)!.cents / 100)} from seat 100. The total includes the discount.`}
                  </p>
                )}
                <div className="pricing-quota">
                  <Icon name="sparkles" size={15} />
                  {plan.seatBased
                    ? t(plan.key === "FAMILY" ? "pricing.updatesPerFamilySeat" : "pricing.updatesPerSeat", { count: plan.aiUpdates })
                    : t("pricing.updates", { count: plan.aiUpdates })}
                </div>
                <ul>
                  {features[plan.key].map(feature => (
                    <li key={feature}>
                      <Icon name="check" size={15} />
                      {feature}
                    </li>
                  ))}
                </ul>
                {plan.seatBased && <p className="subtle">{t("pricing.minSeats", { count: plan.minSeats })}</p>}
                <div className="pricing-cta">
                  {(plan.key === "PRO" || plan.key === "PERSONAL_PRO") && !organizationId && (
                    <Link className="btn primary block" href="/register">
                      {t("pricing.startTrial", { days: trialDays })}
                    </Link>
                  )}
                  <button
                    type="button"
                    className={`btn block ${(plan.key === "PRO" || plan.key === "PERSONAL_PRO") && !organizationId ? "" : "primary"}`}
                    disabled={!canPurchase || busy === plan.key}
                    onClick={() => void checkout(plan)}
                  >
                    {busy === plan.key ? <span className="spinner" /> : null}
                    {organizationId
                      ? t("pricing.choose")
                      : plan.key === "PRO" || plan.key === "PERSONAL_PRO"
                        ? t("pricing.buyNow")
                        : t("pricing.startWith", { plan: t(`plans.${plan.key}`) })}
                  </button>
                </div>
              </article>
            );
          })}
        {!consumer && (
          <article className="pricing-card business-card">
            <h2>{t("plans.BUSINESS")}</h2>
            <p className="subtle">{t("pricing.audience.BUSINESS")}</p>
            <div className="price">
              <strong>{t("pricing.businessCard.price")}</strong>
            </div>
            <p className="subtle">{t("pricing.businessCard.priceNote")}</p>
            <p className="business-card-intro">{t("pricing.businessCard.intro")}</p>
            <ul>
              {[
                ...features.BUSINESS.slice(1),
                t("pricing.enterprise.points.quotas"),
                t("pricing.enterprise.points.invoice"),
                t("pricing.enterprise.points.volume"),
              ].map(feature => (
                <li key={feature}>
                  <Icon name="check" size={15} />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="pricing-cta">
              <a className="btn primary block" href="#business-contact">
                {t("pricing.businessCard.cta")}
              </a>
            </div>
          </article>
        )}
      </div>
      {!consumer && businessContact}
    </div>
  );
}

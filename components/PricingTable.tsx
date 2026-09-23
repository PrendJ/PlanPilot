"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { api, useFeedback } from "./ui";

type Plan = {
  key: "PRO" | "TEAM" | "BUSINESS";
  priceEur: number;
  priceEurYearly: number;
  seatBased: boolean;
  minSeats: number;
  aiUpdates: number;
  consumerPriceEur: number;
  consumerPriceEurYearly: number;
};

const euro = (value: number) => (value % 1 ? value.toFixed(2).replace(".", ",") : String(value));

/**
 * Plan cards with monthly/annual switch, business/private switch and seat selection. Businesses see prices
 * VAT excluded; private customers see the VAT-inclusive price they will pay. Checkout goes straight to Stripe.
 */
export function PricingTable({
  plans,
  organizationId,
  highlight,
  trialDays,
  verified,
}: {
  plans: Plan[];
  organizationId: string | null;
  highlight?: string;
  trialDays: number;
  verified: boolean;
}) {
  const { t } = useI18n();
  const { toast } = useFeedback();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [customerType, setCustomerType] = useState<"business" | "consumer">("business");
  const consumer = customerType === "consumer";
  const [seats, setSeats] = useState<Record<string, number>>({ TEAM: 3, BUSINESS: 5 });
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

  const features: Record<Plan["key"], string[]> = {
    PRO: [
      t("pricing.features.boards"),
      t("pricing.features.dictation"),
      t("pricing.features.preview"),
      t("pricing.features.views"),
      t("pricing.features.export"),
      t("pricing.features.twofa"),
    ],
    TEAM: [
      t("pricing.features.everythingPro"),
      t("pricing.features.realtime"),
      t("pricing.features.comments"),
      t("pricing.features.guests"),
      t("pricing.features.integrations"),
      t("pricing.features.pooled"),
    ],
    BUSINESS: [
      t("pricing.features.everythingTeam"),
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
      <div className="pricing-grid">
        {plans.map(plan => {
          const monthly = consumer ? plan.consumerPriceEur : plan.priceEur;
          const yearlyAmount = consumer ? plan.consumerPriceEurYearly : plan.priceEurYearly;
          const perSeat = interval === "year" ? Math.round((yearlyAmount / 12) * 100) / 100 : monthly;
          const count = plan.seatBased ? seats[plan.key] : 1;
          const total = perSeat * count;
          const featured = (highlight || "TEAM") === plan.key;
          return (
            <article key={plan.key} className={`pricing-card ${featured ? "featured" : ""}`}>
              {featured && <span className="pricing-flag">{highlight ? t("pricing.selected") : t("pricing.popular")}</span>}
              <h2>{t(`plans.${plan.key}`)}</h2>
              <p className="subtle">{t(`pricing.audience.${plan.key}`)}</p>
              <div className="price">
                <strong>€{euro(perSeat)}</strong>
                <span>{plan.seatBased ? t("pricing.perSeatMonth") : t("pricing.perMonth")}</span>
              </div>
              <p className="subtle">
                {interval === "year"
                  ? t(consumer ? "pricing.billedYearlyAmountVatIncluded" : "pricing.billedYearlyAmount", {
                      amount: euro(Math.round(yearlyAmount * count * 100) / 100),
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
                    = €{euro(Math.round(total * 100) / 100)}
                    {t("pricing.perMonthShort")}
                  </span>
                </div>
              )}
              <div className="pricing-quota">
                <Icon name="sparkles" size={15} />
                {plan.seatBased ? t("pricing.updatesPerSeat", { count: plan.aiUpdates }) : t("pricing.updates", { count: plan.aiUpdates })}
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
                {plan.key === "PRO" && !organizationId && (
                  <Link className="btn primary block" href="/register">
                    {t("pricing.startTrial", { days: trialDays })}
                  </Link>
                )}
                <button
                  type="button"
                  className={`btn block ${plan.key === "PRO" && !organizationId ? "" : "primary"}`}
                  disabled={busy === plan.key}
                  onClick={() => void checkout(plan)}
                >
                  {busy === plan.key ? <span className="spinner" /> : null}
                  {organizationId
                    ? t("pricing.choose")
                    : plan.key === "PRO"
                      ? t("pricing.buyNow")
                      : t("pricing.startWith", { plan: t(`plans.${plan.key}`) })}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

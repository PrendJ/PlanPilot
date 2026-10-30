import { describe, expect, it } from "vitest";
import { monthlyPrice, planPriceCents, planPriceTiers, planSeatFloorCents, PLANS } from "@/lib/plans";
import { seatTotalCents, seatFloorCents, SEAT_ECONOMICS, SEAT_PRICING_VERSION } from "@/lib/seat-pricing";

describe("graduated seats", () => {
  it.each(["FAMILY", "TEAM", "BUSINESS"] as const)(
    "%s preserves the first three seats, monotonically discounts marginal seats and stops at the floor",
    plan => {
      for (const customer of ["consumer", "business"] as const) {
        const tiers = planPriceTiers(plan, "month", customer);
        const annual = planPriceTiers(plan, "year", customer);
        const base = planPriceCents(plan, "month", customer);
        const floor = planSeatFloorCents(plan, customer);
        expect(seatTotalCents(tiers, 3)).toBe(base * 3);
        let last = base;
        for (let seat = 4; seat <= 500; seat++) {
          const marginal = seatTotalCents(tiers, seat) - seatTotalCents(tiers, seat - 1);
          expect(marginal).toBeGreaterThanOrEqual(floor);
          expect(marginal).toBeLessThanOrEqual(last);
          if (seat >= 100) expect(marginal).toBe(floor);
          if (base % SEAT_ECONOMICS.priceStepCents === 0) expect(marginal % SEAT_ECONOMICS.priceStepCents).toBe(0);
          expect(seatTotalCents(annual, seat)).toBe(seatTotalCents(tiers, seat) * 10);
          last = marginal;
        }
      }
    },
  );
  it("matches the 5-cent bands of docs/ANALISI_ECONOMICA_POSTI_2026-10-30.md", () => {
    // Family's €4.00 from the 100th seat is the owner's choice (2026-10-30), below the €4.35 margin floor.
    expect(planPriceTiers("FAMILY", "month", "consumer").map(tier => [tier.upTo, tier.cents])).toEqual([
      [3, 450],
      [19, 445],
      [29, 440],
      [39, 435],
      [49, 430],
      [59, 425],
      [69, 420],
      [79, 415],
      [89, 410],
      [99, 405],
      [null, 400],
    ]);
    expect(planPriceTiers("TEAM", "month", "business").map(tier => tier.cents)).toEqual([600, 595, 580, 570, 560, 550, 540, 530, 520, 510, 500]);
    expect(planPriceTiers("TEAM", "month", "business")[1].upTo).toBe(19);
    // No 5-cent step fits between the €9.96 minimum and the €10 base: Business stays flat.
    expect(planPriceTiers("BUSINESS", "month", "business")).toEqual([{ upTo: null, cents: 1000 }]);
  });
  it("protects at least 30% contribution margin at the minimum on annual billing", () => {
    const e = SEAT_ECONOMICS;
    expect(seatFloorCents(PLANS.FAMILY.aiUpdates, false, 1.22)).toBe(435);
    for (const [plan, vat] of [
      ["TEAM", 1],
      ["BUSINESS", 1],
    ] as const) {
      const config = PLANS[plan];
      const minutes = config.prioritySupport ? e.supportMinutes.priority : e.supportMinutes.standard;
      const cost = config.aiUpdates * e.aiUpdateEur + e.infrastructureEur + (minutes * e.supportHourlyEur) / 60;
      const gross = (seatFloorCents(config.aiUpdates, config.prioritySupport, vat) / 100) * e.annualPaidMonths;
      const net = gross / vat;
      const contribution = net - e.annualServedMonths * cost - net * e.feeVatMultiplier * e.feeRateOnGross - e.fixedFeeEur / e.floorSeat - net * e.riskReserve;
      expect(contribution / net).toBeGreaterThanOrEqual(0.3);
    }
  });
  it("keeps existing subscriptions flat until Stripe confirms a graduated price", () => {
    const org = { plan: "TEAM", seats: 100, legalType: "BUSINESS", billingInterval: "month" };
    expect(monthlyPrice(org)).toBe(600);
    const updated = monthlyPrice({ ...org, billingPricingVersion: SEAT_PRICING_VERSION });
    expect(updated).toBe(seatTotalCents(planPriceTiers("TEAM", "month", "business"), 100) / 100);
    expect(updated).toBeLessThan(600);
  });
});

import { describe, expect, it } from "vitest";
import {
  annualCents,
  billableSeats,
  consumerPriceCents,
  creditPackPriceCents,
  floorToTenCents,
  getOrganizationLimits,
  monthlyPrice,
  organizationAccessExpired,
  organizationReadOnly,
  planPriceCents,
  PLANS,
  quotaStatus,
  SELLABLE_PLAN_KEYS,
  TRIAL_DAYS,
} from "@/lib/plans";

const now = new Date("2026-08-26T12:00:00.000Z");

describe("organization license expiry", () => {
  it("expires a temporary paid license at its configured expiry", () => {
    expect(organizationAccessExpired({ plan: "TEAM", trialEndsAt: null, accessExpiresAt: new Date("2026-08-25T23:59:59.999Z") }, now)).toBe(
      true,
    );
  });
  it("keeps an active temporary license writable", () => {
    expect(
      organizationReadOnly(
        { plan: "TEAM", trialEndsAt: null, accessExpiresAt: new Date("2026-08-27T00:00:00.000Z"), readOnlyAt: null },
        now,
      ),
    ).toBe(false);
  });
  it("freezes a finished trial (read-only, never deleted here)", () => {
    expect(
      organizationReadOnly({ plan: "TRIAL", trialEndsAt: new Date("2026-08-20T00:00:00Z"), accessExpiresAt: null, readOnlyAt: null }, now),
    ).toBe(true);
  });
});

describe("commercial catalogue", () => {
  it("sells Pro, Team and Business only", () => expect([...SELLABLE_PLAN_KEYS]).toEqual(["PRO", "TEAM", "BUSINESS"]));
  it("uses the agreed prices, seats and updates", () => {
    expect(PLANS.PRO).toMatchObject({ priceEur: 7, priceEurYearly: 69.6, memberLimit: 1, aiUpdates: 800, seatBased: false });
    expect(PLANS.TEAM).toMatchObject({ priceEur: 6, priceEurYearly: 60, seatBased: true, minSeats: 2, aiUpdates: 600 });
    expect(PLANS.BUSINESS).toMatchObject({
      priceEur: 10,
      priceEurYearly: 99.6,
      seatBased: true,
      minSeats: 2,
      aiUpdates: 1000,
      enforce2fa: true,
    });
  });
  it("never limits the number of boards on any plan", () => {
    for (const plan of Object.values(PLANS)) expect(plan.workspaceLimit).toBe(Infinity);
  });
  it("offers a Pro trial only", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(PLANS.TRIAL).toMatchObject({ label: "Prova Pro", memberLimit: 1, priceEur: 0 });
  });
  it("keeps legacy plans working for existing customers", () => {
    expect(getOrganizationLimits({ plan: "SOLO" })).toMatchObject({ memberLimit: 1, aiUpdates: 800 });
    expect(getOrganizationLimits({ plan: "STUDIO" })).toMatchObject({ memberLimit: 24 });
    // The old flat Team (€24, 10 people) is not squeezed into the new 2-seat minimum.
    expect(getOrganizationLimits({ plan: "TEAM_LEGACY", seats: 1 })).toMatchObject({ memberLimit: 10, aiUpdates: 4000 });
  });
  it("rounds every monthly amount down to the lower ten cents", () => {
    expect(floorToTenCents(833.33)).toBe(830);
    expect(floorToTenCents(854)).toBe(850);
    expect(floorToTenCents(1220)).toBe(1220);
    expect(annualCents(1000)).toBe(9960); // €100/12 = €8.33 → €8.30 per month, €99.60 a year
  });
  it("charges private customers VAT included, rounded down to ten cents", () => {
    expect(consumerPriceCents(7)).toBe(850); // 8.54 → 8.50
    expect(consumerPriceCents(6)).toBe(730); // 7.32 → 7.30
    expect(consumerPriceCents(10)).toBe(1220);
    expect(planPriceCents("PRO", "month", "business")).toBe(700);
    expect(planPriceCents("PRO", "year", "business")).toBe(6960); // 5.83 → 5.80 × 12
    expect(planPriceCents("TEAM", "year", "business")).toBe(6000);
    expect(planPriceCents("BUSINESS", "year", "business")).toBe(9960);
    expect(planPriceCents("PRO", "year", "consumer")).toBe(8400); // 8.50 × 10/12 = 7.08 → 7.00 × 12
    expect(planPriceCents("TEAM", "month", "consumer")).toBe(730);
    expect(planPriceCents("TEAM", "year", "consumer")).toBe(7200);
    expect(planPriceCents("BUSINESS", "year", "consumer")).toBe(12120); // 10.16 → 10.10 × 12
    for (const plan of ["PRO", "TEAM", "BUSINESS"] as const)
      for (const customer of ["business", "consumer"] as const)
        for (const interval of ["month", "year"] as const) {
          const perMonth = planPriceCents(plan, interval, customer) / (interval === "year" ? 12 : 1);
          expect(perMonth % 10).toBe(0);
        }
    expect(creditPackPriceCents("business")).toBe(600);
    expect(creditPackPriceCents("consumer")).toBe(730);
  });
});

describe("seats and limits", () => {
  it("bills at least the minimum seats", () => {
    expect(billableSeats(PLANS.TEAM, 1)).toBe(2);
    expect(billableSeats(PLANS.TEAM, 7)).toBe(7);
    expect(billableSeats(PLANS.PRO, 7)).toBe(1);
  });
  it("pools AI updates per seat and derives the member limit from seats", () => {
    expect(getOrganizationLimits({ plan: "TEAM", seats: 5 })).toMatchObject({ memberLimit: 5, aiUpdates: 3000 });
    expect(getOrganizationLimits({ plan: "BUSINESS", seats: null })).toMatchObject({ memberLimit: 2, aiUpdates: 2000 });
  });
  it("applies Enterprise overrides", () => {
    expect(
      getOrganizationLimits({
        plan: "ENTERPRISE",
        seats: 40,
        memberLimitOverride: 50,
        workspaceLimitOverride: 12,
        aiUpdatesOverride: 90000,
        aiBudgetUsdOverride: 150,
      }),
    ).toMatchObject({ memberLimit: 50, workspaceLimit: 12, aiUpdates: 90000, aiBudgetUsd: 150 });
  });
  it("computes the monthly amount, spreading annual plans", () => {
    expect(monthlyPrice({ plan: "TEAM", seats: 3 })).toBe(18);
    expect(monthlyPrice({ plan: "PRO", billingInterval: "year" })).toBe(5.8);
    expect(monthlyPrice({ plan: "ENTERPRISE" })).toBeNull();
  });
});

describe("quota status", () => {
  const base = { expired: false, readOnly: false, costUsed: 0, costCap: 10, included: 100 };
  it("pauses when nothing is left, when frozen or at the cost circuit breaker", () => {
    expect(quotaStatus({ ...base, remaining: 0 })).toBe("PAUSED");
    expect(quotaStatus({ ...base, remaining: 50, readOnly: true })).toBe("PAUSED");
    expect(quotaStatus({ ...base, remaining: 50, costUsed: 10 })).toBe("PAUSED");
  });
  it("warns at 75% and 90% of the allowance", () => {
    expect(quotaStatus({ ...base, remaining: 50 })).toBe("ACTIVE");
    expect(quotaStatus({ ...base, remaining: 20 })).toBe("WARNING");
    expect(quotaStatus({ ...base, remaining: 5 })).toBe("CRITICAL");
  });
});

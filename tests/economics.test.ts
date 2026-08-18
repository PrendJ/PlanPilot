import { describe, expect, it } from "vitest";
import { calculateEconomics } from "@/lib/admin-analytics";

describe("superadmin economics", () => {
  it("converts provider cost and applies the tax reserve only to profit", () => {
    const result = calculateEconomics({ revenueEur: 100, aiCostUsd: 10, usdToEur: 0.9, stripeFeesEur: 3, fixedCostsEur: 8 });
    expect(result.aiCostEur).toBe(9);
    expect(result.contributionEur).toBe(80);
    expect(result.estimatedNetEur).toBe(56);
    expect(result.marginPercent).toBeCloseTo(56);
  });
  it("does not reduce a loss with a fictional tax benefit", () => {
    expect(calculateEconomics({ revenueEur: 0, aiCostUsd: 5, usdToEur: 1, stripeFeesEur: 0, fixedCostsEur: 30 }).estimatedNetEur).toBe(-35);
  });
});

import { describe, expect, it } from "vitest";
import { getOrganizationLimits, organizationAccessExpired, organizationReadOnly, PLANS, quotaIncreaseFromSolo } from "@/lib/plans";

const now = new Date("2026-08-26T12:00:00.000Z");

describe("organization license expiry", () => {
  it("expires a temporary paid license at its configured expiry", () => {
    expect(organizationAccessExpired({ plan: "TEAM", trialEndsAt: null, accessExpiresAt: new Date("2026-08-25T23:59:59.999Z") }, now)).toBe(true);
  });

  it("keeps an active temporary license writable", () => {
    expect(organizationReadOnly({ plan: "TEAM", trialEndsAt: null, accessExpiresAt: new Date("2026-08-27T00:00:00.000Z"), readOnlyAt: null }, now)).toBe(false);
  });
});

describe("commercial plans", () => {
  it("uses the agreed member and workspace limits", () => {
    expect(PLANS.SOLO).toMatchObject({ priceEur: 10, memberLimit: 1, workspaceLimit: 6, aiBudgetUsd: 4 });
    expect(PLANS.TEAM).toMatchObject({ priceEur: 24, memberLimit: 10, workspaceLimit: 10, aiBudgetUsd: 14 });
    expect(PLANS.STUDIO).toMatchObject({ priceEur: 59, memberLimit: 24, aiBudgetUsd: 40 });
    expect(PLANS.STUDIO.workspaceLimit).toBe(Infinity);
  });

  it("keeps the trial bounded", () => expect(PLANS.TRIAL).toMatchObject({ memberLimit: 1, workspaceLimit: 1, aiBudgetUsd: 0.05 }));
  it("keeps lifetime accounts free but cost-capped", () => expect(PLANS.LIFETIME).toMatchObject({ priceEur: 0, memberLimit: 24, workspaceLimit: Infinity, aiBudgetUsd: 40 }));

  it("compares the shared voice and AI quota with Solo", () => {
    expect(quotaIncreaseFromSolo("SOLO")).toBeNull();
    expect(quotaIncreaseFromSolo("TEAM")).toBe(250);
    expect(quotaIncreaseFromSolo("STUDIO")).toBe(900);
  });

  it("applies Enterprise limits set for an organization", () => {
    expect(getOrganizationLimits({ plan: "ENTERPRISE", memberLimitOverride: 50, workspaceLimitOverride: 12, aiBudgetUsdOverride: 150 })).toMatchObject({ memberLimit: 50, workspaceLimit: 12, aiBudgetUsd: 150 });
  });
});

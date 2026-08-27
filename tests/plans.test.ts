import { describe, expect, it } from "vitest";
import { organizationAccessExpired, organizationReadOnly, PLANS } from "@/lib/plans";

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
    expect(PLANS.TEAM).toMatchObject({ priceEur: 24, memberLimit: 7, workspaceLimit: 10, aiBudgetUsd: 14 });
    expect(PLANS.STUDIO).toMatchObject({ priceEur: 59, memberLimit: 16, aiBudgetUsd: 40 });
    expect(PLANS.STUDIO.workspaceLimit).toBe(Infinity);
  });

  it("keeps the trial bounded", () => expect(PLANS.TRIAL).toMatchObject({ memberLimit: 1, workspaceLimit: 1, aiBudgetUsd: 0.05 }));
  it("keeps lifetime accounts free but cost-capped", () => expect(PLANS.LIFETIME).toMatchObject({ priceEur: 0, memberLimit: 16, workspaceLimit: Infinity, aiBudgetUsd: 40 }));
});

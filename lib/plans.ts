import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Commercial catalogue. Prices are monthly, VAT excluded; seat-based plans are priced per person.
 * "aiUpdates" is the customer-facing unit: one AI update = one planning request (dictation included).
 * Seat-based plans pool aiUpdates × seats. Legacy keys (SOLO, TEAM_LEGACY, STUDIO) stay valid for existing
 * customers on the old flat Stripe prices but are no longer sold. Private customers pay the VAT-inclusive
 * price from consumerPriceCents(). The economics behind these numbers live in docs/PRICING_ECONOMICS.md.
 */
export type PlanKey = "TRIAL" | "PRO" | "TEAM" | "BUSINESS" | "ENTERPRISE" | "LIFETIME" | "SOLO" | "TEAM_LEGACY" | "STUDIO";

export type PlanConfig = {
  label: string;
  priceEur: number | null;
  priceEurYearly: number | null;
  seatBased: boolean;
  minSeats: number;
  memberLimit: number;
  workspaceLimit: number;
  aiUpdates: number;
  sellable: boolean;
  guests: boolean;
  enforce2fa: boolean;
  auditExport: boolean;
  prioritySupport: boolean;
};

const base = {
  priceEurYearly: null,
  seatBased: false,
  minSeats: 1,
  workspaceLimit: Infinity,
  sellable: false,
  guests: false,
  enforce2fa: false,
  auditExport: false,
  prioritySupport: false,
};

export const PLANS: Record<PlanKey, PlanConfig> = {
  TRIAL: { ...base, label: "Prova Pro", priceEur: 0, memberLimit: 1, aiUpdates: 150 },
  PRO: { ...base, label: "Pro", priceEur: 7, priceEurYearly: 70, memberLimit: 1, aiUpdates: 800, sellable: true },
  TEAM: {
    ...base,
    label: "Team",
    priceEur: 6,
    priceEurYearly: 60,
    seatBased: true,
    minSeats: 2,
    memberLimit: 2,
    aiUpdates: 600,
    sellable: true,
    guests: true,
  },
  BUSINESS: {
    ...base,
    label: "Business",
    priceEur: 10,
    priceEurYearly: 100,
    seatBased: true,
    minSeats: 2,
    memberLimit: 2,
    aiUpdates: 1000,
    sellable: true,
    guests: true,
    enforce2fa: true,
    auditExport: true,
    prioritySupport: true,
  },
  ENTERPRISE: {
    ...base,
    label: "Enterprise",
    priceEur: null,
    seatBased: true,
    minSeats: 25,
    memberLimit: Infinity,
    aiUpdates: 1000,
    guests: true,
    enforce2fa: true,
    auditExport: true,
    prioritySupport: true,
  },
  LIFETIME: {
    ...base,
    label: "Lifetime",
    priceEur: 0,
    memberLimit: 24,
    aiUpdates: 20000,
    guests: true,
    enforce2fa: true,
    auditExport: true,
  },
  SOLO: { ...base, label: "Solo (legacy)", priceEur: 10, memberLimit: 1, aiUpdates: 800 },
  // The pre-2026 flat Team price (€24 for up to 10 people), still billed by the old STRIPE_PRICE_TEAM.
  TEAM_LEGACY: { ...base, label: "Team (legacy)", priceEur: 24, memberLimit: 10, aiUpdates: 4000, guests: true },
  STUDIO: { ...base, label: "Studio (legacy)", priceEur: 59, memberLimit: 24, aiUpdates: 12000, guests: true },
};

export const SELLABLE_PLAN_KEYS = ["PRO", "TEAM", "BUSINESS"] as const;
export type SellablePlanKey = (typeof SELLABLE_PLAN_KEYS)[number];
export const TRIAL_DAYS = 14;
/** Safety circuit breaker: provider spend per included update above which AI pauses (normal usage ≈ $0.0005 text, ≈ $0.002 voice). */
export const COST_CAP_PER_UPDATE_USD = 0.005;
export const CREDIT_PACK = { units: 1000, priceEur: 6 } as const;

export type CustomerType = "business" | "consumer";
/** Italian VAT used to derive the price shown to private customers (Stripe Tax computes the actual split). */
export const CONSUMER_VAT_RATE = 0.22;

/**
 * VAT-inclusive price for private customers, in cents: net × 1.22 rounded down to the lower ten cents
 * (Pro €7 → €8.50). The annual price keeps "2 months free" exact: 10 × the consumer monthly price.
 */
export function consumerPriceCents(netMonthlyEur: number, months = 1) {
  const monthly = Math.floor(Math.round(netMonthlyEur * 100 * (1 + CONSUMER_VAT_RATE)) / 10) * 10;
  return monthly * months;
}

/** Amount charged by Stripe, in cents, for one unit (seat) of a plan. */
export function planPriceCents(plan: SellablePlanKey, interval: "month" | "year", customerType: CustomerType) {
  const config = PLANS[plan];
  if (customerType === "consumer") return consumerPriceCents(config.priceEur!, interval === "year" ? 10 : 1);
  return Math.round((interval === "year" ? config.priceEurYearly! : config.priceEur!) * 100);
}

export function creditPackPriceCents(customerType: CustomerType) {
  return customerType === "consumer" ? consumerPriceCents(CREDIT_PACK.priceEur) : CREDIT_PACK.priceEur * 100;
}

type OrganizationEntitlementSource = {
  plan: string;
  seats?: number | null;
  memberLimitOverride?: number | null;
  workspaceLimitOverride?: number | null;
  aiBudgetUsdOverride?: number | null;
  aiUpdatesOverride?: number | null;
};

export function planKey(value?: string | null): PlanKey {
  return value && value in PLANS ? (value as PlanKey) : "TRIAL";
}

export function isSellablePlan(value: string): value is SellablePlanKey {
  return (SELLABLE_PLAN_KEYS as readonly string[]).includes(value);
}

export function billableSeats(plan: PlanConfig, seats?: number | null) {
  if (!plan.seatBased) return 1;
  return Math.max(plan.minSeats, Math.floor(seats || 0));
}

export function getOrganizationLimits(organization: OrganizationEntitlementSource) {
  const key = planKey(organization.plan);
  const plan = PLANS[key];
  const enterprise = key === "ENTERPRISE";
  const seats = billableSeats(plan, organization.seats);
  const memberLimit = enterprise
    ? (organization.memberLimitOverride ?? (organization.seats || plan.memberLimit))
    : plan.seatBased
      ? seats
      : plan.memberLimit;
  const aiUpdates =
    enterprise && organization.aiUpdatesOverride != null
      ? organization.aiUpdatesOverride
      : plan.seatBased
        ? plan.aiUpdates * (enterprise ? Math.max(1, organization.seats || plan.minSeats) : seats)
        : plan.aiUpdates;
  const aiBudgetUsd =
    enterprise && organization.aiBudgetUsdOverride != null ? organization.aiBudgetUsdOverride : aiUpdates * COST_CAP_PER_UPDATE_USD;
  return {
    ...plan,
    key,
    seats,
    memberLimit,
    workspaceLimit: enterprise ? (organization.workspaceLimitOverride ?? plan.workspaceLimit) : plan.workspaceLimit,
    aiUpdates,
    aiBudgetUsd,
  };
}

/** Monthly amount the customer pays, VAT excluded (null = custom quote). */
export function monthlyPrice(organization: OrganizationEntitlementSource & { billingInterval?: string | null }) {
  const limits = getOrganizationLimits(organization);
  if (limits.priceEur === null) return null;
  const perSeat = organization.billingInterval === "year" && limits.priceEurYearly !== null ? limits.priceEurYearly / 12 : limits.priceEur;
  return Math.round(perSeat * limits.seats * 100) / 100;
}

type OrganizationAccess = {
  plan: string;
  trialEndsAt: Date | null;
  accessExpiresAt: Date | null;
  readOnlyAt: Date | null;
  licenseSource?: string;
  lifecycleStatus?: string;
};

export function organizationAccessExpired(
  organization: Pick<OrganizationAccess, "plan" | "trialEndsAt" | "accessExpiresAt">,
  now = new Date(),
) {
  return (
    Boolean(organization.accessExpiresAt && organization.accessExpiresAt < now) ||
    (planKey(organization.plan) === "TRIAL" && Boolean(organization.trialEndsAt && organization.trialEndsAt < now))
  );
}

/** A frozen organization keeps every board readable and exportable; nothing is deleted for non-payment. */
export function organizationReadOnly(organization: OrganizationAccess, now = new Date()) {
  return (
    (organization.lifecycleStatus !== undefined && organization.lifecycleStatus !== "ACTIVE") ||
    Boolean(organization.readOnlyAt) ||
    organizationAccessExpired(organization, now)
  );
}

export function currentPeriodKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function nextPeriodStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export type QuotaStatus = "ACTIVE" | "WARNING" | "CRITICAL" | "PAUSED";

export function quotaStatus(input: {
  expired: boolean;
  readOnly: boolean;
  remaining: number;
  included: number;
  costUsed: number;
  costCap: number;
}): QuotaStatus {
  if (input.expired || input.readOnly || input.remaining <= 0 || input.costUsed >= input.costCap) return "PAUSED";
  const usedShare = input.included > 0 ? 1 - Math.min(input.remaining, input.included) / input.included : 1;
  return usedShare >= 0.9 ? "CRITICAL" : usedShare >= 0.75 ? "WARNING" : "ACTIVE";
}

const usageSelect = {
  plan: true,
  seats: true,
  memberLimitOverride: true,
  workspaceLimitOverride: true,
  aiBudgetUsdOverride: true,
  aiUpdatesOverride: true,
  trialEndsAt: true,
  accessExpiresAt: true,
  readOnlyAt: true,
  lifecycleStatus: true,
  licenseSource: true,
  createdAt: true,
} as const;

function usageWindow(organization: { plan: string; createdAt: Date; trialEndsAt: Date | null }, now: Date): Prisma.UsageEventWhereInput {
  // The trial allowance covers the whole trial, not a calendar month.
  if (planKey(organization.plan) === "TRIAL")
    return {
      createdAt: {
        gte: organization.trialEndsAt ? new Date(organization.trialEndsAt.getTime() - TRIAL_DAYS * 86400000) : organization.createdAt,
      },
    };
  return { periodKey: currentPeriodKey(now) };
}

async function readUsage(client: Prisma.TransactionClient | typeof prisma, organizationId: string, now = new Date()) {
  const organization = await client.organization.findUnique({ where: { id: organizationId }, select: usageSelect });
  if (!organization) return null;
  const limits = getOrganizationLimits(organization);
  const window = usageWindow(organization, now);
  const [included, cost, credits] = await Promise.all([
    client.usageEvent.aggregate({ where: { organizationId, fromCredits: false, ...window }, _sum: { units: true } }),
    client.usageEvent.aggregate({ where: { organizationId, ...window }, _sum: { costUsd: true } }),
    client.creditGrant.aggregate({ where: { organizationId, remaining: { gt: 0 } }, _sum: { remaining: true } }),
  ]);
  const usedIncluded = included._sum.units || 0;
  const creditUnits = credits._sum.remaining || 0;
  const includedRemaining = Math.max(0, limits.aiUpdates - usedIncluded);
  return {
    organization,
    limits,
    usedIncluded,
    creditUnits,
    includedRemaining,
    remaining: Number.isFinite(limits.aiUpdates) ? includedRemaining + creditUnits : Infinity,
    costUsed: cost._sum.costUsd || 0,
  };
}

export async function getUsageStatus(organizationId: string) {
  const now = new Date();
  const usage = await readUsage(prisma, organizationId, now);
  if (!usage) return null;
  const { organization, limits } = usage;
  const expired = organizationAccessExpired(organization, now);
  // Freeze on expiry; never schedule deletion for non-payment.
  if (expired && !organization.readOnlyAt) await prisma.organization.update({ where: { id: organizationId }, data: { readOnlyAt: now } });
  const readOnly = organizationReadOnly(organization, now);
  const status = quotaStatus({
    expired,
    readOnly,
    remaining: usage.remaining,
    included: limits.aiUpdates,
    costUsed: usage.costUsed,
    costCap: limits.aiBudgetUsd,
  });
  const percent =
    Number.isFinite(limits.aiUpdates) && limits.aiUpdates > 0
      ? Math.min(100, Math.round((usage.usedIncluded / limits.aiUpdates) * 100))
      : 0;
  return {
    plan: limits.key,
    used: usage.usedIncluded,
    included: limits.aiUpdates,
    credits: usage.creditUnits,
    remaining: usage.remaining,
    percent,
    status,
    readOnly,
    resetsAt: limits.key === "TRIAL" ? organization.trialEndsAt : nextPeriodStart(now),
    costUsedUsd: usage.costUsed,
    costCapUsd: limits.aiBudgetUsd,
  };
}

export class QuotaExceededError extends Error {
  constructor() {
    super("QUOTA_EXHAUSTED");
  }
}

/**
 * Atomically reserves one AI update before calling the provider. The advisory lock serializes
 * concurrent reservations of the same organization, so parallel requests cannot exceed the allowance.
 * Units above the monthly allowance are drawn from purchased credit packs.
 */
export async function reserveAiUpdate(input: {
  organizationId: string;
  workspaceId?: string;
  userId?: string;
  category: string;
  model: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quota:${input.organizationId}`}))`;
    const usage = await readUsage(tx, input.organizationId);
    if (!usage) throw new QuotaExceededError();
    const readOnly = organizationReadOnly(usage.organization);
    if (readOnly || usage.costUsed >= usage.limits.aiBudgetUsd) throw new QuotaExceededError();
    let grantId: string | null = null;
    if (usage.includedRemaining <= 0) {
      const grant = await tx.creditGrant.findFirst({
        where: { organizationId: input.organizationId, remaining: { gt: 0 } },
        orderBy: { createdAt: "asc" },
      });
      if (!grant) throw new QuotaExceededError();
      await tx.creditGrant.update({ where: { id: grant.id }, data: { remaining: { decrement: 1 } } });
      grantId = grant.id;
    }
    const metadata = {
      ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {}),
      ...(grantId && { grantId }),
    };
    return tx.usageEvent.create({
      data: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        category: input.category,
        model: input.model,
        costUsd: 0,
        units: 1,
        fromCredits: Boolean(grantId),
        periodKey: currentPeriodKey(),
        metadata,
      },
    });
  });
}

/** Gives the reserved update back when the provider failed before producing a proposal. */
export async function refundAiUpdate(eventId: string) {
  await prisma
    .$transaction(async tx => {
      const event = await tx.usageEvent.findUnique({ where: { id: eventId } });
      if (!event || event.units !== 1) return;
      await tx.usageEvent.delete({ where: { id: eventId } });
      const grantId = (event.metadata as { grantId?: string } | null)?.grantId;
      if (event.fromCredits && grantId) await tx.creditGrant.updateMany({ where: { id: grantId }, data: { remaining: { increment: 1 } } });
    })
    .catch((error: unknown) => console.error("Quota refund failed", error));
}

/** Records the provider cost of a call. Never throws: accounting must not turn a committed change into an error. */
export async function recordUsage(input: {
  organizationId: string;
  workspaceId?: string;
  userId?: string;
  providerRequestId?: string | null;
  category: string;
  model: string;
  costUsd?: number | null;
  metadata?: object;
}) {
  const costUsd = Math.max(0, Number(input.costUsd || 0));
  if (!costUsd) return;
  await prisma.usageEvent
    .create({
      data: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        providerRequestId: input.providerRequestId || undefined,
        category: input.category,
        model: input.model,
        costUsd,
        periodKey: currentPeriodKey(),
        metadata: input.metadata,
      },
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error) || !error.message.includes("Unique constraint")) console.error("Usage accounting failed", error);
    });
}

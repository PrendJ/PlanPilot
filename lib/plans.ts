import { graduatedSeatTiers, SEAT_ECONOMICS, seatFloorCents, seatTotalCents, SEAT_PRICING_VERSION } from "@/lib/seat-pricing";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Commercial catalogue. Prices are monthly, VAT excluded; seat-based plans are priced per person.
 * "aiUpdates" is the customer-facing unit: one AI update = one planning request (dictation included).
 * Seat-based plans pool aiUpdates × seats. Legacy keys (SOLO, TEAM_LEGACY, STUDIO) stay valid for existing
 * customers on the old flat Stripe prices but are no longer sold. Private customers pay the VAT-inclusive
 * price from consumerPriceCents(). The economics behind these numbers live in docs/PRICING_ECONOMICS.md.
 */
export type PlanKey =
  "TRIAL" | "PERSONAL_PRO" | "FAMILY" | "PRO" | "TEAM" | "BUSINESS" | "ENTERPRISE" | "LIFETIME" | "SOLO" | "TEAM_LEGACY" | "STUDIO";

export type PlanConfig = {
  label: string;
  priceEur: number | null;
  priceEurYearly: number | null;
  seatBased: boolean;
  minSeats: number;
  memberLimit: number;
  /** Active boards per person (seat); the organization limit is this × its people. Anti-abuse, not a selling point. */
  boardsPerPerson: number;
  /** Above this many boards per person nothing is blocked: BoardCue admins are told, to spot abuse. Null = no soft cap. */
  boardSoftLimitPerPerson: number | null;
  /** Months of change history (activity, AI update logs, proposals) kept before the hourly retention deletes it. */
  historyMonths: number;
  aiUpdates: number;
  /** Owner-set price from seat 100 (net, like priceEur), below the computed margin floor. */
  seatFloorEur?: number;
  sellable: boolean;
  guests: boolean;
  enforce2fa: boolean;
  auditExport: boolean;
  prioritySupport: boolean;
};

/**
 * Owner decision of 2026-10-25, after docs/ANALISI_COSTO_BOARD_2026-10-25.md: base plans (trial, Pro personale, Pro)
 * get 20 boards per person and 6 months of history; advanced plans retain 24 months.
 * Owner clarification 2026-10-29: FAMILY/TEAM have a soft threshold of 50 boards per purchased seat; BUSINESS 200.
 */
export const BASE_LIMITS = { boardsPerPerson: 20, historyMonths: 6 } as const;
export const ADVANCED_LIMITS = { boardsPerPerson: 50, historyMonths: 24 } as const;
/** Business (owner, 2026-10-25): unlimited boards, with a soft cap of 200 per person that alerts BoardCue admins. */
export const BUSINESS_BOARD_SOFT_LIMIT = 200;

const base = {
  priceEurYearly: null,
  seatBased: false,
  minSeats: 1,
  ...ADVANCED_LIMITS,
  boardSoftLimitPerPerson: null,
  sellable: false,
  guests: false,
  enforce2fa: false,
  auditExport: false,
  prioritySupport: false,
};

export const PLANS: Record<PlanKey, PlanConfig> = {
  TRIAL: { ...base, ...BASE_LIMITS, label: "Prova Pro", priceEur: 0, memberLimit: 1, aiUpdates: 150 },
  PERSONAL_PRO: {
    ...base,
    ...BASE_LIMITS,
    label: "Pro",
    priceEur: 4.02,
    priceEurYearly: annualEur(4.02),
    memberLimit: 1,
    aiUpdates: 300,
    sellable: true,
  },
  FAMILY: {
    ...base,
    label: "Family",
    boardsPerPerson: Infinity,
    boardSoftLimitPerPerson: 50,
    // €4.50 per person per month VAT included for private customers (owner, 2026-10-23): below Pro personale.
    priceEur: 3.69,
    priceEurYearly: annualEur(3.69),
    seatBased: true,
    minSeats: 2,
    memberLimit: 2,
    aiUpdates: 300,
    // Owner, 2026-10-30: seats descend to €4.00 VAT included from the 100th, accepting ~24% margin on those seats.
    seatFloorEur: 3.28,
    sellable: true,
    guests: true,
  },
  PRO: { ...base, ...BASE_LIMITS, label: "Pro", priceEur: 7, priceEurYearly: annualEur(7), memberLimit: 1, aiUpdates: 800, sellable: true },
  TEAM: {
    ...base,
    label: "Team",
    boardsPerPerson: Infinity,
    boardSoftLimitPerPerson: 50,
    priceEur: 6,
    priceEurYearly: annualEur(6),
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
    boardsPerPerson: Infinity,
    boardSoftLimitPerPerson: BUSINESS_BOARD_SOFT_LIMIT,
    priceEur: 10,
    priceEurYearly: annualEur(10),
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
  // Legacy single-person plan: the same limits as Pro, which replaced it.
  SOLO: { ...base, ...BASE_LIMITS, label: "Solo (legacy)", priceEur: 10, memberLimit: 1, aiUpdates: 800 },
  // The pre-2026 flat Team price (€24 for up to 10 people), still billed by the old STRIPE_PRICE_TEAM.
  TEAM_LEGACY: { ...base, label: "Team (legacy)", priceEur: 24, memberLimit: 10, aiUpdates: 4000, guests: true },
  STUDIO: { ...base, label: "Studio (legacy)", priceEur: 59, memberLimit: 24, aiUpdates: 12000, guests: true },
};

export const SELLABLE_PLAN_KEYS = ["PERSONAL_PRO", "FAMILY", "PRO", "TEAM", "BUSINESS"] as const;
export type SellablePlanKey = (typeof SELLABLE_PLAN_KEYS)[number];
export const TRIAL_DAYS = 14;
/** Safety circuit breaker: provider spend per included update above which AI pauses (normal usage ≈ $0.0005 text, ≈ $0.002 voice). */
export const COST_CAP_PER_UPDATE_USD = 0.005;
export const CREDIT_PACK = { units: 1000, priceEur: 6 } as const;

export type CustomerType = "business" | "consumer";
/** Italian VAT used to derive the price shown to private customers (Stripe Tax computes the actual split). */
export const CONSUMER_VAT_RATE = 0.22;

/**
 * Every displayed amount is rounded down to ten cents, always in the customer's favour. Annual plans charge
 * 10 monthly payments (two months free), also rounded down; the UI shows the annual total, never a
 * monthly equivalent.
 */
export function floorToTenCents(cents: number) {
  return Math.floor(Math.round(cents) / 10) * 10;
}

export function annualCents(monthlyCents: number) {
  return floorToTenCents(Math.round(monthlyCents) * 10);
}

function annualEur(monthlyEur: number) {
  return annualCents(monthlyEur * 100) / 100;
}

/** VAT-inclusive monthly price for private customers, in cents: net × 1.22 rounded down to ten cents. */
export function consumerPriceCents(netMonthlyEur: number) {
  return floorToTenCents(netMonthlyEur * 100 * (1 + CONSUMER_VAT_RATE));
}

/** Amount charged by Stripe, in cents, for one unit (seat) of a plan. */
export function planPriceCents(plan: SellablePlanKey, interval: "month" | "year", customerType: CustomerType) {
  const config = PLANS[plan];
  const monthly = customerType === "consumer" ? consumerPriceCents(config.priceEur!) : Math.round(config.priceEur! * 100);
  return interval === "year" ? annualCents(monthly) : monthly;
}

/** Monthly price of one seat from the 100th on, in cents. */
export function planSeatFloorCents(plan: SellablePlanKey, customerType: CustomerType) {
  const config = PLANS[plan];
  if (config.seatFloorEur !== undefined)
    return customerType === "consumer"
      ? consumerPriceCents(config.seatFloorEur)
      : Math.ceil(Math.round(config.seatFloorEur * 100) / SEAT_ECONOMICS.priceStepCents) * SEAT_ECONOMICS.priceStepCents;
  return seatFloorCents(config.aiUpdates, config.prioritySupport, customerType === "consumer" ? 1 + CONSUMER_VAT_RATE : 1);
}

/** Graduated pricing applies only to the current seat-based catalogue. */
export function planPriceTiers(plan: SellablePlanKey, interval: "month" | "year", customerType: CustomerType) {
  if (!PLANS[plan].seatBased) return [{ upTo: null, cents: planPriceCents(plan, interval, customerType) }];
  return graduatedSeatTiers(planPriceCents(plan, "month", customerType), planSeatFloorCents(plan, customerType), interval === "year");
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
  const people = Number.isFinite(memberLimit) ? Math.max(1, memberLimit) : Math.max(1, organization.seats || plan.minSeats);
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
    // Family, Team and Business have soft board thresholds only; Enterprise can have contractual overrides.
    workspaceLimit:
      enterprise && organization.workspaceLimitOverride != null ? organization.workspaceLimitOverride : plan.boardsPerPerson * people,
    boardSoftLimit: plan.boardSoftLimitPerPerson === null ? null : plan.boardSoftLimitPerPerson * people,
    aiUpdates,
    aiBudgetUsd,
  };
}

/** Monthly equivalent the customer pays; VAT included for private customers (null = custom quote). */
export function monthlyPrice(
  organization: OrganizationEntitlementSource & {
    billingInterval?: string | null;
    legalType?: string | null;
    billingPricingVersion?: string | null;
  },
) {
  const limits = getOrganizationLimits(organization);
  if (limits.priceEur === null) return null;
  const customerType = organization.legalType === "PERSONAL" ? "consumer" : "business";
  if (limits.sellable && organization.billingPricingVersion === SEAT_PRICING_VERSION) {
    const interval = organization.billingInterval === "year" ? "year" : "month";
    return (
      Math.round(
        seatTotalCents(planPriceTiers(limits.key as SellablePlanKey, interval, customerType), limits.seats) /
          (interval === "year" ? 12 : 1),
      ) / 100
    );
  }
  const monthly = limits.sellable ? planPriceCents(limits.key as SellablePlanKey, "month", customerType) / 100 : limits.priceEur;
  const yearly = limits.sellable ? planPriceCents(limits.key as SellablePlanKey, "year", customerType) / 100 : limits.priceEurYearly;
  const perSeat = organization.billingInterval === "year" && yearly !== null ? yearly / 12 : monthly;
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

/** Plans grouped by how long their change history is kept, with the date before which it is deleted. */
export function historyRetention(now = new Date()) {
  const groups = new Map<number, PlanKey[]>();
  for (const [key, plan] of Object.entries(PLANS) as Array<[PlanKey, PlanConfig]>)
    groups.set(plan.historyMonths, [...(groups.get(plan.historyMonths) || []), key]);
  return [...groups].map(([months, plans]) => {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    return { months, plans, cutoff };
  });
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
  const [included, cost, credits, spentCredits] = await Promise.all([
    client.usageEvent.aggregate({ where: { organizationId, fromCredits: false, ...window }, _sum: { units: true } }),
    client.usageEvent.aggregate({ where: { organizationId, ...window }, _sum: { costUsd: true } }),
    client.creditGrant.aggregate({ where: { organizationId, remaining: { gt: 0 } }, _sum: { remaining: true } }),
    client.usageEvent.aggregate({ where: { organizationId, fromCredits: true, ...window }, _sum: { units: true } }),
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
    costCap: limits.aiBudgetUsd + (creditUnits + (spentCredits._sum.units || 0)) * COST_CAP_PER_UPDATE_USD,
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
    costCap: usage.costCap,
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
    costCapUsd: usage.costCap,
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
    if (readOnly || usage.costUsed >= usage.costCap) throw new QuotaExceededError();
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

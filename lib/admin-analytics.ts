import { prisma } from "@/lib/prisma";
import { currentPeriodKey, monthlyPrice } from "@/lib/plans";
import { getUsdToEurRate } from "@/lib/exchange-rate";

const activeStatuses = new Set(["active", "trialing", "past_due"]);
// Owner infrastructure costs per month (VPS, backups, email, e-invoicing…): see docs/PRICING_ECONOMICS.md.
const fixedCostsEur = Number(process.env.MONTHLY_FIXED_COST_EUR || 60);

/** Monthly recurring revenue of a Stripe-paying organization: per-seat price × seats, annual plans spread over 12 months. */
function paidRevenue(organization: Parameters<typeof monthlyPrice>[0], status?: string | null) {
  if (!status || !activeStatuses.has(status)) return 0;
  return monthlyPrice(organization) ?? 0;
}

export function calculateEconomics(input: {
  revenueEur: number;
  aiCostUsd: number;
  stripeFeesEur: number;
  fixedCostsEur: number;
  usdToEur: number;
}) {
  const aiCostEur = input.aiCostUsd * input.usdToEur;
  const contributionEur = input.revenueEur - aiCostEur - input.stripeFeesEur - input.fixedCostsEur;
  const estimatedNetEur = contributionEur > 0 ? contributionEur * 0.7 : contributionEur;
  return { aiCostEur, contributionEur, estimatedNetEur, marginPercent: input.revenueEur ? (estimatedNetEur / input.revenueEur) * 100 : 0 };
}

export async function getAdminAnalytics(period = currentPeriodKey()) {
  const since = new Date(Date.now() - 30 * 86400000);
  const [
    productEvents,
    exchangeRate,
    organizations,
    users,
    workspaces,
    usageByOrganization,
    usageByUser,
    usageByWorkspace,
    aiRequests,
    audit,
  ] = await Promise.all([
    prisma.productEvent.findMany({ where: { day: { gte: since.toISOString().slice(0, 10) } } }),
    getUsdToEurRate(),
    prisma.organization.findMany({
      orderBy: { name: "asc" },
      include: {
        subscription: true,
        createdBy: { select: { id: true, name: true, email: true, lifetimeFree: true } },
        _count: { select: { members: true, workspaces: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }],
      include: { _count: { select: { organizationMemberships: true, memberships: true } } },
    }),
    prisma.workspace.findMany({
      orderBy: { name: "asc" },
      include: {
        organization: { select: { id: true, name: true, plan: true, legalType: true } },
        _count: { select: { members: true, cards: true } },
      },
    }),
    prisma.usageEvent.groupBy({ by: ["organizationId"], where: { periodKey: period }, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.usageEvent.groupBy({
      by: ["userId"],
      where: { periodKey: period, userId: { not: null } },
      _sum: { costUsd: true },
      _count: { _all: true },
    }),
    prisma.usageEvent.groupBy({
      by: ["workspaceId"],
      where: { periodKey: period, workspaceId: { not: null } },
      _sum: { costUsd: true },
      _count: { _all: true },
    }),
    prisma.usageEvent.count({ where: { periodKey: period } }),
    prisma.adminAuditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { actor: { select: { name: true, email: true } } },
    }),
  ]);
  const usdToEur = exchangeRate.usdToEur;
  const orgUsage = new Map(
    usageByOrganization.map(row => [row.organizationId, { cost: row._sum.costUsd || 0, requests: row._count._all }]),
  );
  const userUsage = new Map(
    usageByUser.filter(row => row.userId).map(row => [row.userId!, { cost: row._sum.costUsd || 0, requests: row._count._all }]),
  );
  const workspaceUsage = new Map(
    usageByWorkspace
      .filter(row => row.workspaceId)
      .map(row => [row.workspaceId!, { cost: row._sum.costUsd || 0, requests: row._count._all }]),
  );
  const organizationRows = organizations.map(organization => {
    const usage = orgUsage.get(organization.id) || { cost: 0, requests: 0 };
    const revenueEur = paidRevenue(organization, organization.subscription?.status);
    const aiCostEur = usage.cost * usdToEur;
    const stripeFeesEur = revenueEur ? revenueEur * 0.027 + 0.25 : 0;
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      legalType: organization.legalType,
      plan: organization.plan,
      licenseSource: organization.licenseSource,
      lifecycleStatus: organization.lifecycleStatus,
      accessExpiresAt: organization.accessExpiresAt,
      readOnly: Boolean(organization.readOnlyAt),
      subscriptionStatus: organization.subscription?.status || null,
      memberLimitOverride: organization.memberLimitOverride,
      workspaceLimitOverride: organization.workspaceLimitOverride,
      aiBudgetUsdOverride: organization.aiBudgetUsdOverride,
      aiUpdatesOverride: organization.aiUpdatesOverride,
      seats: organization.seats,
      members: organization._count.members,
      workspaces: organization._count.workspaces,
      createdBy: organization.createdBy,
      revenueEur,
      aiCostUsd: usage.cost,
      aiCostEur,
      stripeFeesEur,
      contributionEur: revenueEur - aiCostEur - stripeFeesEur,
      aiRequests: usage.requests,
    };
  });
  const revenueEur = organizationRows.reduce((sum, row) => sum + row.revenueEur, 0);
  const aiCostUsd = organizationRows.reduce((sum, row) => sum + row.aiCostUsd, 0);
  const stripeFeesEur = organizationRows.reduce((sum, row) => sum + row.stripeFeesEur, 0);
  const economics = calculateEconomics({ revenueEur, aiCostUsd, stripeFeesEur, fixedCostsEur, usdToEur });
  const recent = organizations.filter(organization => organization.createdAt >= since);
  const activation = {
    newTeams30d: recent.length,
    firstAiUpdate: recent.filter(o => o.firstAiUpdateAt).length,
    firstVoice: recent.filter(o => o.firstVoiceAt).length,
    firstInvite: recent.filter(o => o.firstInviteAt).length,
    paid: recent.filter(o => o.paidAt).length,
  };
  const eventTotals = productEvents.reduce<Record<string, number>>(
    (totals, event) => ({ ...totals, [event.name]: (totals[event.name] || 0) + event.count }),
    {},
  );
  return {
    kpis: { activation, events30d: eventTotals },
    overview: {
      period,
      revenueEur,
      aiCostUsd,
      aiCostEur: economics.aiCostEur,
      stripeFeesEur,
      fixedCostsEur,
      contributionEur: economics.contributionEur,
      estimatedNetEur: economics.estimatedNetEur,
      marginPercent: economics.marginPercent,
      organizations: organizations.length,
      companies: organizations.filter(o => o.legalType !== "PERSONAL").length,
      individuals: organizations.filter(o => o.legalType === "PERSONAL").length,
      paidOrganizations: organizationRows.filter(o => o.revenueEur > 0).length,
      lifetimeOrganizations: organizations.filter(o => o.plan === "LIFETIME").length,
      users: users.length,
      workspaces: workspaces.length,
      aiRequests,
      usdToEur,
      exchangeRate,
    },
    organizations: organizationRows,
    users: users.map(user => {
      const usage = userUsage.get(user.id) || { cost: 0, requests: 0 };
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        platformRole: user.platformRole,
        lifecycleStatus: user.lifecycleStatus,
        defaultOrganizationId: user.defaultOrganizationId,
        lifetimeFree: user.lifetimeFree,
        emailVerified: Boolean(user.emailVerifiedAt),
        organizations: user._count.organizationMemberships,
        workspaces: user._count.memberships,
        aiRequests: usage.requests,
        aiCostUsd: usage.cost,
        aiCostEur: usage.cost * usdToEur,
      };
    }),
    workspaces: workspaces.map(workspace => {
      const usage = workspaceUsage.get(workspace.id) || { cost: 0, requests: 0 };
      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        organization: workspace.organization,
        members: workspace._count.members,
        cards: workspace._count.cards,
        aiRequests: usage.requests,
        aiCostUsd: usage.cost,
        aiCostEur: usage.cost * usdToEur,
      };
    }),
    audit,
  };
}

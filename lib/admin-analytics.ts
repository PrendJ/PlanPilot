import { prisma } from "@/lib/prisma";
import { currentPeriodKey, PLANS, planKey } from "@/lib/plans";
import { getUsdToEurRate } from "@/lib/exchange-rate";

const activeStatuses = new Set(["active", "trialing", "past_due"]);
const fixedCostsEur = Number(process.env.MONTHLY_FIXED_COST_EUR || 30);

function paidRevenue(plan: string, status?: string | null) {
  if (!status || !activeStatuses.has(status)) return 0;
  const price = PLANS[planKey(plan)].priceEur;
  return typeof price === "number" ? price : 0;
}

export function calculateEconomics(input: { revenueEur: number; aiCostUsd: number; stripeFeesEur: number; fixedCostsEur: number; usdToEur: number }) {
  const aiCostEur = input.aiCostUsd * input.usdToEur;
  const contributionEur = input.revenueEur - aiCostEur - input.stripeFeesEur - input.fixedCostsEur;
  const estimatedNetEur = contributionEur > 0 ? contributionEur * 0.7 : contributionEur;
  return { aiCostEur, contributionEur, estimatedNetEur, marginPercent: input.revenueEur ? (estimatedNetEur / input.revenueEur) * 100 : 0 };
}

export async function getAdminAnalytics(period = currentPeriodKey()) {
  const [exchangeRate, organizations, users, workspaces, usageByOrganization, usageByUser, usageByWorkspace, aiRequests, audit] = await Promise.all([
    getUsdToEurRate(),
    prisma.organization.findMany({ orderBy: { name: "asc" }, include: { subscription: true, createdBy: { select: { id: true, name: true, email: true, lifetimeFree: true } }, _count: { select: { members: true, workspaces: true } } } }),
    prisma.user.findMany({ orderBy: [{ name: "asc" }, { email: "asc" }], include: { _count: { select: { organizationMemberships: true, memberships: true } } } }),
    prisma.workspace.findMany({ orderBy: { name: "asc" }, include: { organization: { select: { id: true, name: true, plan: true, legalType: true } }, _count: { select: { members: true, cards: true } } } }),
    prisma.usageEvent.groupBy({ by: ["organizationId"], where: { periodKey: period }, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.usageEvent.groupBy({ by: ["userId"], where: { periodKey: period, userId: { not: null } }, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.usageEvent.groupBy({ by: ["workspaceId"], where: { periodKey: period, workspaceId: { not: null } }, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.usageEvent.count({ where: { periodKey: period } }),
    prisma.adminAuditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { actor: { select: { name: true, email: true } } } }),
  ]);
  const usdToEur = exchangeRate.usdToEur;
  const orgUsage = new Map(usageByOrganization.map((row) => [row.organizationId, { cost: row._sum.costUsd || 0, requests: row._count._all }]));
  const userUsage = new Map(usageByUser.filter((row) => row.userId).map((row) => [row.userId!, { cost: row._sum.costUsd || 0, requests: row._count._all }]));
  const workspaceUsage = new Map(usageByWorkspace.filter((row) => row.workspaceId).map((row) => [row.workspaceId!, { cost: row._sum.costUsd || 0, requests: row._count._all }]));
  const organizationRows = organizations.map((organization) => {
    const usage = orgUsage.get(organization.id) || { cost: 0, requests: 0 };
    const revenueEur = paidRevenue(organization.plan, organization.subscription?.status);
    const aiCostEur = usage.cost * usdToEur;
    const stripeFeesEur = revenueEur ? revenueEur * 0.027 + 0.25 : 0;
    return { id: organization.id, name: organization.name, slug: organization.slug, legalType: organization.legalType, plan: organization.plan, licenseSource: organization.licenseSource, lifecycleStatus: organization.lifecycleStatus, accessExpiresAt: organization.accessExpiresAt, readOnly: Boolean(organization.readOnlyAt), subscriptionStatus: organization.subscription?.status || null, members: organization._count.members, workspaces: organization._count.workspaces, createdBy: organization.createdBy, revenueEur, aiCostUsd: usage.cost, aiCostEur, stripeFeesEur, contributionEur: revenueEur - aiCostEur - stripeFeesEur, aiRequests: usage.requests };
  });
  const revenueEur = organizationRows.reduce((sum, row) => sum + row.revenueEur, 0);
  const aiCostUsd = organizationRows.reduce((sum, row) => sum + row.aiCostUsd, 0);
  const stripeFeesEur = organizationRows.reduce((sum, row) => sum + row.stripeFeesEur, 0);
  const economics = calculateEconomics({ revenueEur, aiCostUsd, stripeFeesEur, fixedCostsEur, usdToEur });
  return {
    overview: { period, revenueEur, aiCostUsd, aiCostEur: economics.aiCostEur, stripeFeesEur, fixedCostsEur, contributionEur: economics.contributionEur, estimatedNetEur: economics.estimatedNetEur, marginPercent: economics.marginPercent, organizations: organizations.length, companies: organizations.filter((o) => o.legalType !== "PERSONAL").length, individuals: organizations.filter((o) => o.legalType === "PERSONAL").length, paidOrganizations: organizationRows.filter((o) => o.revenueEur > 0).length, lifetimeOrganizations: organizations.filter((o) => o.plan === "LIFETIME").length, users: users.length, workspaces: workspaces.length, aiRequests, usdToEur, exchangeRate },
    organizations: organizationRows,
    users: users.map((user) => { const usage = userUsage.get(user.id) || { cost: 0, requests: 0 }; return { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin, platformRole: user.platformRole, lifecycleStatus: user.lifecycleStatus, defaultOrganizationId: user.defaultOrganizationId, lifetimeFree: user.lifetimeFree, emailVerified: Boolean(user.emailVerifiedAt), organizations: user._count.organizationMemberships, workspaces: user._count.memberships, aiRequests: usage.requests, aiCostUsd: usage.cost, aiCostEur: usage.cost * usdToEur }; }),
    workspaces: workspaces.map((workspace) => { const usage = workspaceUsage.get(workspace.id) || { cost: 0, requests: 0 }; return { id: workspace.id, name: workspace.name, slug: workspace.slug, organization: workspace.organization, members: workspace._count.members, cards: workspace._count.cards, aiRequests: usage.requests, aiCostUsd: usage.cost, aiCostEur: usage.cost * usdToEur }; }),
    audit,
  };
}

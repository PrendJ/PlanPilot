import { prisma } from "@/lib/prisma";

export const PLANS = {
  TRIAL: { label: "Trial", priceEur: 0, memberLimit: 1, workspaceLimit: 1, aiBudgetUsd: 0.05 },
  SOLO: { label: "Solo", priceEur: 10, memberLimit: 1, workspaceLimit: 6, aiBudgetUsd: 4 },
  TEAM: { label: "Team", priceEur: 24, memberLimit: 7, workspaceLimit: 10, aiBudgetUsd: 14 },
  STUDIO: { label: "Studio", priceEur: 59, memberLimit: 16, workspaceLimit: Infinity, aiBudgetUsd: 40 },
  LIFETIME: { label: "Lifetime", priceEur: 0, memberLimit: 16, workspaceLimit: Infinity, aiBudgetUsd: 40 },
  ENTERPRISE: { label: "Enterprise", priceEur: null, memberLimit: Infinity, workspaceLimit: Infinity, aiBudgetUsd: Infinity },
} as const;
export type PlanKey = keyof typeof PLANS;

export function planKey(value?: string): PlanKey {
  return value && value in PLANS ? value as PlanKey : "TRIAL";
}

export function currentPeriodKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getUsageStatus(organizationId: string) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { plan: true, trialEndsAt: true, readOnlyAt: true } });
  if (!organization) return null;
  const key = planKey(organization.plan);
  const config = PLANS[key];
  const aggregate = await prisma.usageEvent.aggregate({ where: { organizationId, periodKey: currentPeriodKey() }, _sum: { costUsd: true } });
  const used = aggregate._sum.costUsd || 0;
  const budget = config.aiBudgetUsd;
  const expired = key === "TRIAL" && organization.trialEndsAt != null && organization.trialEndsAt < new Date();
  if (expired && !organization.readOnlyAt) await prisma.organization.update({ where: { id: organizationId }, data: { readOnlyAt: new Date(), deleteAfter: new Date(Date.now() + 30 * 86400000) } });
  const percent = Number.isFinite(budget) ? Math.min(100, Math.round((used / budget) * 100)) : 0;
  const resetsAt = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
  return { plan: key, used, budget, percent, status: expired || organization.readOnlyAt || used >= budget ? "PAUSED" : percent >= 90 ? "CRITICAL" : percent >= 75 ? "WARNING" : "ACTIVE", resetsAt };
}

export async function recordUsage(input: { organizationId: string; workspaceId?: string; userId?: string; providerRequestId?: string | null; category: string; model: string; costUsd?: number | null; metadata?: object }) {
  const costUsd = Math.max(0, Number(input.costUsd || 0));
  if (!costUsd) return;
  await prisma.usageEvent.create({ data: { organizationId: input.organizationId, workspaceId: input.workspaceId, userId: input.userId, providerRequestId: input.providerRequestId || undefined, category: input.category, model: input.model, costUsd, periodKey: currentPeriodKey(), metadata: input.metadata } }).catch((error: unknown) => {
    if (!(error instanceof Error) || !error.message.includes("Unique constraint")) throw error;
  });
}

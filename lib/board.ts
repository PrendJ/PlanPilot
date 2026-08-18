import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function workspaceForUser(slug: string, userId: string) {
  return prisma.workspace.findFirst({ where: { slug, members: { some: { userId } } }, include: { organization: true } });
}

export function workspaceReadOnly(workspace: { organization: { readOnlyAt: Date | null; plan: string; trialEndsAt: Date | null } }) {
  return Boolean(workspace.organization.readOnlyAt) || (workspace.organization.plan === "TRIAL" && Boolean(workspace.organization.trialEndsAt && workspace.organization.trialEndsAt < new Date()));
}

export async function assertRevision(workspaceId: string, revision: unknown, tx: Prisma.TransactionClient = prisma) {
  if (!Number.isInteger(revision)) return false;
  const current = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { revision: true } });
  return current?.revision === revision;
}

export async function logActivity(tx: Prisma.TransactionClient, input: { organizationId: string; workspaceId: string; userId: string; type: string; entityType: string; entityId?: string; beforeState?: Prisma.InputJsonValue; afterState?: Prisma.InputJsonValue; batchId?: string; undoable?: boolean }) {
  await tx.activityEvent.create({ data: input });
}

export async function bumpRevision(tx: Prisma.TransactionClient, workspaceId: string) {
  return tx.workspace.update({ where: { id: workspaceId }, data: { revision: { increment: 1 } }, select: { revision: true } });
}

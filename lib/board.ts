import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { organizationReadOnly } from "@/lib/plans";
import { queueProjectPush } from "@/lib/push";

export async function workspaceForUser(slug: string, userId: string) {
  return prisma.workspace.findFirst({ where: { slug, members: { some: { userId } } }, include: { organization: true } });
}

export function workspaceReadOnly(workspace: { lifecycleStatus?: string; organization: { readOnlyAt: Date | null; plan: string; trialEndsAt: Date | null; accessExpiresAt: Date | null; lifecycleStatus?: string } }) {
  return workspace.lifecycleStatus !== undefined && workspace.lifecycleStatus !== "ACTIVE" || workspace.organization.lifecycleStatus !== undefined && workspace.organization.lifecycleStatus !== "ACTIVE" || organizationReadOnly(workspace.organization);
}

/** Must run inside the same transaction as the writes and bumpRevision.
 * The workspace lock serializes board writers. Shared access-row locks order
 * membership revocation, account suspension and organization changes with commit.
 * Never use the root Prisma client here: autocommit would release the locks early.
 */
export async function assertRevision(
  workspaceId: string,
  revision: unknown,
  tx: Prisma.TransactionClient,
  actor: { userId: string; manageColumns?: boolean },
) {
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) return false;
  const roles = actor.manageColumns ? ["OWNER", "ADMIN"] : ["OWNER", "ADMIN", "MEMBER"];
  const rows = await tx.$queryRaw<Array<{
    revision: number; plan: string; trialEndsAt: Date | null;
    accessExpiresAt: Date | null; readOnlyAt: Date | null;
  }>>(Prisma.sql`
    SELECT w."revision", o."plan", o."trialEndsAt", o."accessExpiresAt", o."readOnlyAt"
    FROM "Workspace" w
    JOIN "WorkspaceMember" m ON m."workspaceId" = w."id"
    JOIN "User" u ON u."id" = m."userId"
    JOIN "Organization" o ON o."id" = w."organizationId"
    WHERE w."id" = ${workspaceId} AND m."userId" = ${actor.userId}
      AND m."role" IN (${Prisma.join(roles)})
      AND u."emailVerifiedAt" IS NOT NULL AND u."lifecycleStatus" = 'ACTIVE'
      AND w."lifecycleStatus" = 'ACTIVE' AND o."lifecycleStatus" = 'ACTIVE'
    FOR UPDATE OF w FOR SHARE OF m, u, o
  `);
  const current = rows[0];
  return Boolean(current && current.revision === revision && !organizationReadOnly(current));
}

export function isBoardConflict(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.message === "STALE_REVISION") return true;
  // PostgreSQL may abort a deadlock with a concurrent lifecycle operation.
  const databaseError = error as Error & { code?: string; meta?: { code?: string } };
  return databaseError.code === "P2034" || (databaseError.code === "P2010"
    && ["40P01", "40001"].includes(databaseError.meta?.code || ""));
}

export async function logActivity(tx: Prisma.TransactionClient, input: { organizationId: string; workspaceId: string; userId: string; type: string; entityType: string; entityId?: string; beforeState?: Prisma.InputJsonValue; afterState?: Prisma.InputJsonValue; batchId?: string; undoable?: boolean }) {
  const event = await tx.activityEvent.create({ data: input });
  await queueProjectPush(tx, event);
}

export async function bumpRevision(tx: Prisma.TransactionClient, workspaceId: string) {
  return tx.workspace.update({ where: { id: workspaceId }, data: { revision: { increment: 1 } }, select: { revision: true } });
}

import { Prisma } from "@prisma/client";
import { organizationReadOnly } from "@/lib/plans";

export const SPACE_PLANS = ["FAMILY", "TEAM", "BUSINESS", "ENTERPRISE", "LIFETIME", "TEAM_LEGACY", "STUDIO"];
export const canUseSpaces = (plan: string) => SPACE_PLANS.includes(plan);
export const canManageSpaces = (role: string) => role === "OWNER" || role === "ADMIN";

/** All space writes share the seat lock with invitations and board membership changes. */
export async function lockSpaceOrganization(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seats:${organizationId}`}))`;
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "OrganizationMember" WHERE "organizationId" = ${organizationId} AND "userId" = ${userId} FOR SHARE`;
  const access = await tx.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true, user: true },
  });
  if (
    !access ||
    !canManageSpaces(access.role) ||
    access.user.lifecycleStatus !== "ACTIVE" ||
    (access.organization.require2fa && !access.user.totpEnabledAt)
  )
    throw new Error("FORBIDDEN");
  if (organizationReadOnly(access.organization)) throw new Error("READ_ONLY");
  if (!canUseSpaces(access.organization.plan)) throw new Error("FORBIDDEN");
  return access;
}

/** Materialized board grants keep every existing read/write boundary consistent.
 * Direct board invitations remain direct; revoking a space removes only inherited grants.
 */
export async function syncSpaceBoard(tx: Prisma.TransactionClient, boardId: string, spaceId: string | null) {
  await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${boardId} FOR UPDATE`;
  const members = spaceId ? await tx.spaceMember.findMany({ where: { spaceId } }) : [];
  const inherited = await tx.workspaceMember.findMany({ where: { workspaceId: boardId, inheritedFromSpaceId: { not: null } } });
  for (const grant of inherited) {
    if (members.some(member => member.userId === grant.userId)) continue;
    await tx.workspaceMember.delete({ where: { id: grant.id } });
    await tx.cardAssignee.deleteMany({ where: { userId: grant.userId, card: { workspaceId: boardId } } });
  }
  for (const member of members) {
    const existing = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: boardId, userId: member.userId } },
    });
    if (existing && !existing.inheritedFromSpaceId) continue;
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: boardId, userId: member.userId } },
      create: { workspaceId: boardId, userId: member.userId, role: member.role, inheritedFromSpaceId: spaceId },
      update: { role: member.role, inheritedFromSpaceId: spaceId },
    });
    if (member.role === "GUEST") await tx.cardAssignee.deleteMany({ where: { userId: member.userId, card: { workspaceId: boardId } } });
  }
  await tx.workspace.update({ where: { id: boardId }, data: { revision: { increment: 1 } } });
}

export async function syncSpace(tx: Prisma.TransactionClient, spaceId: string) {
  const boards = await tx.workspace.findMany({ where: { spaceId }, orderBy: { id: "asc" }, select: { id: true } });
  for (const board of boards) await syncSpaceBoard(tx, board.id, spaceId);
}

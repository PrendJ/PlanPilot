import { Prisma } from "@prisma/client";
import { hasPlatformCapability } from "@/lib/platform-access";
import { getOrganizationLimits, organizationReadOnly } from "@/lib/plans";

export async function mutateMembership(tx: Prisma.TransactionClient, input: {
  workspaceId: string; userId: string; actorId: string;
  role?: "OWNER" | "ADMIN" | "MEMBER" | "GUEST"; platform?: boolean;
}) {
  const board = await tx.workspace.findUnique({ where: { id: input.workspaceId }, select: { organizationId: true } });
  if (!board) throw new Error("NOT_FOUND");
  // Same seat lock as invite acceptance, then serialize every role change on the board.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seats:${board.organizationId}`}))`;
  await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${input.workspaceId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.actorId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${board.organizationId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "WorkspaceMember" WHERE "workspaceId" = ${input.workspaceId} AND "userId" = ${input.actorId} FOR SHARE`;
  const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: input.workspaceId }, include: { organization: true } });
  const actor = await tx.user.findUnique({ where: { id: input.actorId } });
  const own = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorId } } });
  const permitted = input.platform ? actor && hasPlatformCapability(actor, "SUPPORT") : own?.role === "OWNER" || (!input.role && input.userId === input.actorId && own);
  if (!actor || actor.lifecycleStatus !== "ACTIVE" || !permitted || (workspace.organization.require2fa && !actor.totpEnabledAt)) throw new Error("FORBIDDEN");
  if (input.role && (workspace.lifecycleStatus !== "ACTIVE" || workspace.organization.lifecycleStatus !== "ACTIVE" || organizationReadOnly(workspace.organization))) throw new Error("READ_ONLY");
  const target = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } } });
  if (target?.inheritedFromSpaceId && !input.platform) throw new Error("FORBIDDEN");
  if (!target && !input.platform) throw new Error("NOT_FOUND");
  if (target?.role === "OWNER" && input.role !== "OWNER" && await tx.workspaceMember.count({ where: { workspaceId: input.workspaceId, role: "OWNER" } }) <= 1) throw new Error("LAST_OWNER");
  if (input.role) {
    const orgMember = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: board.organizationId, userId: input.userId } } });
    if (input.role !== "GUEST" && (!orgMember || orgMember.role === "GUEST")) {
      const used = await tx.organizationMember.count({ where: { organizationId: board.organizationId, role: { not: "GUEST" } } });
      if (used >= getOrganizationLimits(workspace.organization).memberLimit) throw new Error("MEMBER_LIMIT");
    }
    await tx.organizationMember.upsert({ where: { organizationId_userId: { organizationId: board.organizationId, userId: input.userId } },
      create: { organizationId: board.organizationId, userId: input.userId, role: input.role === "GUEST" ? "GUEST" : "MEMBER" },
      update: input.role !== "GUEST" && orgMember?.role === "GUEST" ? { role: "MEMBER" } : {},
    });
    const membership = await tx.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
      create: { workspaceId: input.workspaceId, userId: input.userId, role: input.role }, update: { role: input.role, ...(input.platform && { inheritedFromSpaceId: null }) } });
    await tx.workspace.update({ where: { id: input.workspaceId }, data: { revision: { increment: 1 } } });
    return membership;
  }
  if (target) await tx.workspaceMember.delete({ where: { id: target.id } });
  await tx.cardAssignee.deleteMany({ where: { userId: input.userId, card: { workspaceId: input.workspaceId } } });
  if (!await tx.workspaceMember.count({ where: { userId: input.userId, workspace: { organizationId: board.organizationId } } }) && !await tx.spaceMember.count({ where: { userId: input.userId, space: { organizationId: board.organizationId } } }))
    await tx.organizationMember.deleteMany({ where: { organizationId: board.organizationId, userId: input.userId, role: { in: ["MEMBER", "GUEST"] } } });
  await tx.workspace.update({ where: { id: input.workspaceId }, data: { revision: { increment: 1 } } });
  return null;
}

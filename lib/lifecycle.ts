import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const THIRTY_DAYS = 30 * 86400000;
const TEN_YEARS = 3652 * 86400000;

type Subject = "user" | "organization" | "workspace";
type Action = "suspend" | "reactivate" | "archive";

function deletionDate() { return new Date(Date.now() + THIRTY_DAYS); }
function retentionDate() { return new Date(Date.now() + TEN_YEARS); }

async function audit(actorId: string, action: string, subjectType: string, subjectId: string, reason: string, metadata?: Prisma.InputJsonValue) {
  await prisma.adminAuditEvent.create({ data: { actorId, action, targetType: subjectType, targetId: subjectId, metadata: { reason, metadata } } });
}

/** Lifecycle transitions deliberately operate on metadata only: no staff endpoint reads board content. */
export async function changeLifecycle(input: { subject: Subject; id: string; action: Action; reason: string; actorId: string; transferSupportUserId?: string }) {
  const now = new Date();
  if (input.action === "archive") {
    if (input.subject === "organization") {
      const organization = await prisma.organization.findUnique({ where: { id: input.id }, select: { id: true } });
      if (!organization) throw new Error("Organization not found");
      await prisma.$transaction([
        prisma.organization.update({ where: { id: input.id }, data: { lifecycleStatus: "ARCHIVED", archivedAt: now, deleteAfter: deletionDate(), readOnlyAt: now } }),
        prisma.workspace.updateMany({ where: { organizationId: input.id }, data: { lifecycleStatus: "ARCHIVED", archivedAt: now, deleteAfter: deletionDate() } }),
      ]);
    } else if (input.subject === "workspace") {
      const workspace = await prisma.workspace.findUnique({ where: { id: input.id }, select: { id: true } });
      if (!workspace) throw new Error("Workspace not found");
      await prisma.workspace.update({ where: { id: input.id }, data: { lifecycleStatus: "ARCHIVED", archivedAt: now, deleteAfter: deletionDate() } });
    } else {
      const user = await prisma.user.findUnique({ where: { id: input.id }, select: { id: true } });
      if (!user) throw new Error("User not found");
      const owned = await prisma.organization.findMany({ where: { createdById: input.id, lifecycleStatus: "ACTIVE" }, select: { id: true, name: true } });
      if (owned.length && !input.transferSupportUserId) throw new Error("Select a Support user to receive the owned organizations before archiving this user");
      if (input.transferSupportUserId) {
        const support = await prisma.user.findUnique({ where: { id: input.transferSupportUserId }, select: { id: true, platformRole: true, lifecycleStatus: true } });
        if (!support || support.platformRole !== "SUPPORT" || support.lifecycleStatus !== "ACTIVE") throw new Error("The replacement owner must be an active Support user");
        for (const organization of owned) {
          await prisma.$transaction([
            prisma.organization.update({ where: { id: organization.id }, data: { createdById: support.id } }),
            prisma.organizationMember.upsert({ where: { organizationId_userId: { organizationId: organization.id, userId: support.id } }, create: { organizationId: organization.id, userId: support.id, role: "OWNER" }, update: { role: "OWNER" } }),
          ]);
          await audit(input.actorId, "OWNERSHIP_TRANSFERRED", "organization", organization.id, input.reason, { previousOwnerId: input.id, supportOwnerId: support.id });
        }
      }
      await prisma.$transaction([
        prisma.user.update({ where: { id: input.id }, data: { lifecycleStatus: "ARCHIVED", archivedAt: now, deleteAfter: deletionDate() } }),
        prisma.session.deleteMany({ where: { userId: input.id } }),
      ]);
    }
  } else {
    const active = input.action === "reactivate";
    const data = active ? { lifecycleStatus: "ACTIVE" as const, suspendedAt: null, archivedAt: null, deleteAfter: null, ...(input.subject === "organization" ? { readOnlyAt: null } : {}) } : { lifecycleStatus: "SUSPENDED" as const, suspendedAt: now };
    if (input.subject === "organization") await prisma.organization.update({ where: { id: input.id }, data });
    if (input.subject === "workspace") await prisma.workspace.update({ where: { id: input.id }, data });
    if (input.subject === "user") {
      await prisma.$transaction([prisma.user.update({ where: { id: input.id }, data }), prisma.session.deleteMany({ where: { userId: input.id } })]);
    }
  }
  await audit(input.actorId, `LIFECYCLE_${input.action.toUpperCase()}`, input.subject, input.id, input.reason, { transferSupportUserId: input.transferSupportUserId });
}

async function retain(subjectType: string, subjectId: string, kind: string, payload: Prisma.InputJsonValue) {
  await prisma.retainedRecord.create({ data: { subjectType, subjectId, kind, payload, expiresAt: retentionDate() } });
}

export async function runRetention() {
  const now = new Date();
  const workspaces = await prisma.workspace.findMany({ where: { lifecycleStatus: "ARCHIVED", deleteAfter: { lte: now } }, select: { id: true, slug: true, name: true, organizationId: true, createdAt: true, archivedAt: true } });
  for (const workspace of workspaces) {
    await retain("workspace", workspace.id, "OPERATIONS_DELETION", workspace as unknown as Prisma.InputJsonValue);
    await prisma.workspace.delete({ where: { id: workspace.id } });
  }
  const organizations = await prisma.organization.findMany({ where: { lifecycleStatus: "ARCHIVED", deleteAfter: { lte: now } }, select: { id: true, slug: true, name: true, plan: true, licenseSource: true, createdAt: true, archivedAt: true } });
  for (const organization of organizations) {
    await retain("organization", organization.id, "OPERATIONS_DELETION", organization as unknown as Prisma.InputJsonValue);
    await prisma.organization.delete({ where: { id: organization.id } });
  }
  const users = await prisma.user.findMany({ where: { lifecycleStatus: "ARCHIVED", deleteAfter: { lte: now } }, select: { id: true, email: true, name: true, createdAt: true } });
  for (const user of users) {
    await retain("user", user.id, "OPERATIONS_DELETION", user as unknown as Prisma.InputJsonValue);
    await prisma.user.update({ where: { id: user.id }, data: { email: `deleted+${user.id}@invalid.boardcue`, name: "Deleted user", passwordHash: "PURGED", deleteAfter: null } });
  }
  const expiredArchives = await prisma.retainedRecord.deleteMany({ where: { expiresAt: { lte: now } } });
  return { deletedWorkspaces: workspaces.length, deletedOrganizations: organizations.length, anonymizedUsers: users.length, deletedExpiredArchives: expiredArchives.count };
}

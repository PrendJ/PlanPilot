import { prisma } from "@/lib/prisma";

const THIRTY_DAYS = 30 * 86400000;

/**
 * Self-service account deletion (GDPR art. 17). Teams where the person is the only owner are archived
 * together with their boards and purged by the retention job after 30 days; teams with other owners
 * keep working without them. The account is signed out everywhere and anonymized after 30 days.
 */
export async function deleteOwnAccount(userId: string) {
  const now = new Date();
  const deleteAfter = new Date(now.getTime() + THIRTY_DAYS);
  const owned = await prisma.organizationMember.findMany({ where: { userId, role: "OWNER" }, select: { organizationId: true } });
  const archived: string[] = [];
  for (const { organizationId } of owned) {
    const otherOwners = await prisma.organizationMember.count({ where: { organizationId, role: "OWNER", userId: { not: userId } } });
    if (otherOwners) continue;
    archived.push(organizationId);
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: organizationId },
        data: { lifecycleStatus: "ARCHIVED", archivedAt: now, readOnlyAt: now, deleteAfter },
      }),
      prisma.workspace.updateMany({ where: { organizationId }, data: { lifecycleStatus: "ARCHIVED", archivedAt: now, deleteAfter } }),
    ]);
  }
  await prisma.$transaction([
    prisma.workspaceMember.deleteMany({ where: { userId, workspace: { organizationId: { notIn: archived } } } }),
    prisma.organizationMember.deleteMany({ where: { userId, organizationId: { notIn: archived } } }),
    prisma.apiToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.user.update({
      where: { id: userId },
      data: { lifecycleStatus: "ARCHIVED", archivedAt: now, deleteAfter, defaultOrganizationId: null },
    }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  return { archivedOrganizations: archived.length };
}

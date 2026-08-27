import { prisma } from "@/lib/prisma";
import { createOrganization } from "@/lib/workspace";

export function chooseDefaultOrganization<T>(current: T | null, createdOrganizations: T[]) {
  return current || createdOrganizations[0] || null;
}

export function canCreateWorkspaceInOrganization(defaultOrganizationId: string | null, organizationId: string, role: string | null) {
  return defaultOrganizationId === organizationId || role === "OWNER" || role === "ADMIN";
}

export async function ensureDefaultOrganization(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, locale: true, defaultOrganizationId: true },
  });
  if (!user) throw new Error("Utente non trovato");

  const current = user.defaultOrganizationId
    ? await prisma.organization.findUnique({ where: { id: user.defaultOrganizationId } })
    : null;
  const existing = current ? [] : await prisma.organization.findMany({
      where: { createdById: user.id, lifecycleStatus: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
      take: 1,
    });
  let organization = chooseDefaultOrganization(current, existing);
  if (!organization) {
    organization = await createOrganization({
      name: `Spazio personale di ${user.name}`,
      userId: user.id,
      locale: user.locale,
      legalType: "PERSONAL",
    });
  }

  await prisma.$transaction([
    prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      create: { organizationId: organization.id, userId: user.id, role: "OWNER" },
      update: { role: "OWNER" },
    }),
    prisma.user.update({ where: { id: user.id }, data: { defaultOrganizationId: organization.id } }),
  ]);
  return organization;
}

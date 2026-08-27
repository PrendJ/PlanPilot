export function firstPersonalOrganization<T extends { organization: { createdById: string; legalType: string } }>(userId: string, memberships: readonly T[]) {
  return memberships.find(membership => membership.organization.createdById === userId && membership.organization.legalType === "PERSONAL") || null;
}

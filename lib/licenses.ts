import { prisma } from "@/lib/prisma";
import { PLANS, planKey, type PlanKey } from "@/lib/plans";

function parseExpiry(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || date <= new Date()) throw new Error("La scadenza deve essere futura");
  return date;
}

export async function grantManualLicense(input: { organizationId: string; plan: PlanKey; expiresAt?: Date | string | null; actorId: string; reason: string }) {
  const expiresAt = parseExpiry(input.expiresAt);
  if (input.plan === "LIFETIME" && expiresAt) throw new Error("Una licenza lifetime non può scadere");
  const trialEndsAt = input.plan === "TRIAL" ? (expiresAt || new Date(Date.now() + 7 * 86400000)) : null;
  return prisma.$transaction(async (tx) => {
    const stored = await tx.organization.findUniqueOrThrow({ where: { id: input.organizationId }, select: { plan: true, accessExpiresAt: true, licenseSource: true, lifecycleStatus: true, createdBy: { select: { lifetimeFree: true } } } });
    if (!canAssignManualPlan(stored.createdBy.lifetimeFree, input.plan)) throw new Error("Revoca prima l'accesso Free a vita dell'utente");
    const { createdBy: _createdBy, ...before } = stored;
    const organization = await tx.organization.update({ where: { id: input.organizationId }, data: { plan: input.plan, licenseSource: input.plan === "LIFETIME" ? "LIFETIME" : "MANUAL", accessExpiresAt: expiresAt, trialEndsAt, readOnlyAt: null, deleteAfter: null, lifecycleStatus: "ACTIVE", suspendedAt: null, archivedAt: null } });
    await tx.adminAuditEvent.create({ data: { actorId: input.actorId, action: "LICENSE_GRANTED", targetType: "ORGANIZATION", targetId: input.organizationId, metadata: { before, plan: input.plan, expiresAt, reason: input.reason } } });
    return organization;
  });
}

export async function revokeManualLicense(input: { organizationId: string; actorId: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({ where: { organizationId: input.organizationId } });
    const active = Boolean(subscription && ["active", "trialing", "past_due"].includes(subscription.status));
    const price = subscription?.stripePriceId;
    const plan = price === process.env.STRIPE_PRICE_SOLO ? "SOLO" : price === process.env.STRIPE_PRICE_TEAM ? "TEAM" : price === process.env.STRIPE_PRICE_STUDIO ? "STUDIO" : "TRIAL";
    const organization = await tx.organization.update({ where: { id: input.organizationId }, data: active ? { plan, licenseSource: "STRIPE", accessExpiresAt: null, trialEndsAt: null, readOnlyAt: null, deleteAfter: null } : { plan: "TRIAL", licenseSource: "TRIAL", accessExpiresAt: null, trialEndsAt: new Date(Date.now() + 7 * 86400000), readOnlyAt: null, deleteAfter: null } });
    await tx.adminAuditEvent.create({ data: { actorId: input.actorId, action: "MANUAL_LICENSE_REVOKED", targetType: "ORGANIZATION", targetId: input.organizationId, metadata: { reason: input.reason, fallback: active ? plan : "TRIAL" } } });
    return organization;
  });
}

export function isValidPlan(value: string): value is PlanKey {
  return value in PLANS && planKey(value) === value;
}

export function canAssignManualPlan(lifetimeFree: boolean, plan: PlanKey) {
  return !lifetimeFree || plan === "LIFETIME";
}

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasPlatformCapability, platformRoleOf } from "@/lib/platform-access";
import { prisma } from "@/lib/prisma";
import { createOrganization } from "@/lib/workspace";
import { stripe } from "@/lib/stripe";

async function requireAdmin() { const user = await getCurrentUser(); return user && hasPlatformCapability(user, "METADATA") ? user : null; }
const createSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(254), password: z.string().min(10).max(200), platformRole: z.enum(["USER", "SUPPORT", "BILLING", "SUPERADMIN"]).default("USER"), isAdmin: z.boolean().optional(), lifetimeFree: z.boolean().default(false) });
const updateSchema = z.object({ id: z.string().cuid(), platformRole: z.enum(["USER", "SUPPORT", "BILLING", "SUPERADMIN"]).optional(), isAdmin: z.boolean().optional(), lifetimeFree: z.boolean().optional(), emailVerified: z.boolean().optional() });

const userSelect = { id: true, email: true, name: true, platformRole: true, lifecycleStatus: true, isAdmin: true, lifetimeFree: true, emailVerifiedAt: true, memberships: { select: { role: true, workspace: { select: { id: true, name: true, slug: true } } } }, organizationMemberships: { orderBy: { createdAt: "asc" as const }, select: { role: true, organization: { select: { id: true, name: true, slug: true, plan: true, legalType: true, createdById: true, licenseSource: true, accessExpiresAt: true } } } } } as const;

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [users, workspaces] = await Promise.all([prisma.user.findMany({ orderBy: [{ name: "asc" }, { email: "asc" }], select: userSelect }), prisma.workspace.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } })]);
  return NextResponse.json({ users, workspaces });
}

export async function POST(request: Request) {
  const actor = await requireAdmin(); if (!actor || !hasPlatformCapability(actor, "PLATFORM_ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Controlla i dati inseriti", details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  try {
    const platformRole = body.isAdmin ? "SUPERADMIN" : body.platformRole;
    const user = await prisma.user.create({ data: { email: body.email.toLowerCase(), name: body.name, passwordHash: await bcrypt.hash(body.password, 12), emailVerifiedAt: new Date(), platformRole, isAdmin: platformRole === "SUPERADMIN", lifetimeFree: body.lifetimeFree, lifetimeFreeGrantedAt: body.lifetimeFree ? new Date() : null, lifetimeFreeGrantedBy: body.lifetimeFree ? actor.id : null }, select: userSelect });
    await createOrganization({ name: `${body.name}`, userId: user.id, locale: "it", legalType: "PERSONAL" });
    await prisma.adminAuditEvent.create({ data: { actorId: actor.id, action: "USER_CREATED", targetType: "USER", targetId: user.id, metadata: { lifetimeFree: body.lifetimeFree, platformRole } } });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) { const message = error instanceof Error ? error.message : "Could not create user"; return NextResponse.json({ error: message.includes("Unique constraint") ? "Esiste già un utente con questa email" : message }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  const actor = await requireAdmin(); if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Aggiornamento non valido" }, { status: 400 });
  const body = parsed.data;
  const superadmin = hasPlatformCapability(actor, "PLATFORM_ADMIN");
  if (!superadmin && (body.platformRole !== undefined || body.lifetimeFree !== undefined)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const requestedRole = body.isAdmin === undefined ? body.platformRole : body.isAdmin ? "SUPERADMIN" : "USER";
  if (body.id === actor.id && requestedRole && requestedRole !== "SUPERADMIN") return NextResponse.json({ error: "Non puoi rimuovere il tuo ruolo superadmin" }, { status: 400 });
  const before = await prisma.user.findUnique({ where: { id: body.id }, select: { platformRole: true, isAdmin: true, lifetimeFree: true, emailVerifiedAt: true } }); if (!before) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  const granting = body.lifetimeFree === true && !before.lifetimeFree;
  const revoking = body.lifetimeFree === false && before.lifetimeFree;
  const subscriptions = granting ? await prisma.subscription.findMany({ where: { organization: { createdById: body.id }, stripeSubscriptionId: { not: null }, status: { in: ["active", "trialing", "past_due"] } }, select: { id: true, stripeSubscriptionId: true } }) : [];
  const ownedOrganizations = revoking ? await prisma.organization.findMany({ where: { createdById: body.id, plan: "LIFETIME" }, include: { subscription: true } }) : [];
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: body.id }, data: { ...(requestedRole && { platformRole: requestedRole, isAdmin: requestedRole === "SUPERADMIN" }), ...(body.lifetimeFree !== undefined && { lifetimeFree: body.lifetimeFree }), ...(granting && { lifetimeFreeGrantedAt: new Date(), lifetimeFreeGrantedBy: actor.id }), ...(revoking && { lifetimeFreeGrantedAt: null, lifetimeFreeGrantedBy: null }), ...(body.emailVerified !== undefined && { emailVerifiedAt: body.emailVerified ? new Date() : null }) }, select: userSelect });
    if (granting) await tx.organization.updateMany({ where: { createdById: body.id }, data: { plan: "LIFETIME", licenseSource: "LIFETIME", accessExpiresAt: null, trialEndsAt: null, readOnlyAt: null, deleteAfter: null } });
    if (revoking) for (const organization of ownedOrganizations) { const priceId = organization.subscription?.stripePriceId; const paidPlan = priceId === process.env.STRIPE_PRICE_SOLO ? "SOLO" : priceId === process.env.STRIPE_PRICE_TEAM ? "TEAM" : priceId === process.env.STRIPE_PRICE_STUDIO ? "STUDIO" : null; const active = organization.subscription && ["active", "trialing", "past_due"].includes(organization.subscription.status); await tx.organization.update({ where: { id: organization.id }, data: active && paidPlan ? { plan: paidPlan, licenseSource: "STRIPE", trialEndsAt: null, readOnlyAt: null, deleteAfter: null } : { plan: "TRIAL", licenseSource: "TRIAL", trialEndsAt: new Date(Date.now() + 7 * 86400000), readOnlyAt: null, deleteAfter: null } }); }
    if (granting && subscriptions.length) await tx.subscription.updateMany({ where: { id: { in: subscriptions.map((item) => item.id) } }, data: { cancelAtPeriodEnd: true } });
    await tx.adminAuditEvent.create({ data: { actorId: actor.id, action: granting ? "LIFETIME_GRANTED" : revoking ? "LIFETIME_REVOKED" : "USER_UPDATED", targetType: "USER", targetId: body.id, metadata: { before, changes: body } } });
    return updated;
  });
  const warnings: string[] = [];
  if (granting && subscriptions.length && process.env.STRIPE_SECRET_KEY) for (const subscription of subscriptions) try { await stripe().subscriptions.update(subscription.stripeSubscriptionId!, { cancel_at_period_end: true }); } catch { warnings.push("Un abbonamento Stripe richiede verifica manuale"); }
  return NextResponse.json({ user, warnings });
}

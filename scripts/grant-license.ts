import { PLANS, planKey } from "../lib/plans";
import { prisma } from "../lib/prisma";
import { createOrganization } from "../lib/workspace";
import { grantManualLicense } from "../lib/licenses";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function expiry(value?: string) {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59.999Z`) : new Date(value);
  if (Number.isNaN(date.getTime()) || date <= new Date()) throw new Error("--expires-at must be a future ISO date or datetime");
  return date;
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const requestedPlan = arg("plan")?.toUpperCase();
  const organizationSlug = arg("organization");
  const actorEmail = arg("actor")?.toLowerCase();
  if (!email || !requestedPlan || !(requestedPlan in PLANS)) {
    throw new Error("Usage: npm run license:grant -- --email person@example.com --plan TEAM [--expires-at 2026-12-31] [--organization organization-slug] [--actor superadmin@example.com]");
  }
  const plan = planKey(requestedPlan);
  const accessExpiresAt = expiry(arg("expires-at"));
  if (plan === "LIFETIME" && accessExpiresAt) throw new Error("A LIFETIME license cannot have an expiry date");

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) throw new Error(`No user found for ${email}. Create the account first with npm run user:create.`);
  const actor = actorEmail ? await prisma.user.findUnique({ where: { email: actorEmail }, select: { id: true, platformRole: true, isAdmin: true } }) : await prisma.user.findFirst({ where: { OR: [{ platformRole: "SUPERADMIN" }, { isAdmin: true }] }, select: { id: true, platformRole: true, isAdmin: true } });
  if (!actor || (actor.platformRole !== "SUPERADMIN" && !actor.isAdmin)) throw new Error("No Superadmin actor found. Add --actor superadmin@example.com.");

  let organization = organizationSlug
    ? await prisma.organization.findFirst({ where: { slug: organizationSlug, createdById: user.id } })
    : null;
  if (organizationSlug && !organization) throw new Error(`No organization '${organizationSlug}' owned by ${email}`);
  if (!organization) {
    const organizations = await prisma.organization.findMany({ where: { createdById: user.id }, orderBy: { createdAt: "asc" } });
    if (organizations.length > 1) throw new Error("This user owns multiple organizations. Specify --organization <slug>.");
    organization = organizations[0] || await createOrganization({ name: user.name, userId: user.id, legalType: "PERSONAL" });
  }

  await grantManualLicense({ organizationId: organization.id, plan, expiresAt: accessExpiresAt, actorId: actor.id, reason: "CLI license provisioning" });
  console.log(`License granted: ${email} | organization=${organization.slug} | plan=${plan} | expires=${accessExpiresAt?.toISOString() || "never"}`);
  console.log("Manual license takes precedence over Stripe until revoked or expired.");
}

main().finally(() => prisma.$disconnect());

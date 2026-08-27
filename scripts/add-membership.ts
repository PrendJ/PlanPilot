import { prisma } from "../lib/prisma";
import { PLANS, planKey } from "../lib/plans";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const slug = arg("workspace");
  const role = (arg("role") || "MEMBER").toUpperCase();
  if (!email || !slug) throw new Error("Usage: npm run membership:add -- --email user@example.com --workspace team-slug [--role MEMBER]");
  if (!["OWNER", "ADMIN", "MEMBER"].includes(role)) throw new Error("Role must be OWNER, ADMIN or MEMBER");
  const [user, workspace] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.workspace.findUnique({ where: { slug }, include: { organization: true } }),
  ]);
  if (!user || !workspace) throw new Error("User or workspace not found");
  const existingOrganizationMember = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: workspace.organizationId, userId: user.id } } });
  if (!existingOrganizationMember) {
    const limit = PLANS[planKey(workspace.organization.plan)].memberLimit;
    const members = await prisma.organizationMember.count({ where: { organizationId: workspace.organizationId } });
    if (members >= limit) throw new Error(`The ${planKey(workspace.organization.plan)} plan has reached its member limit`);
  }
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: workspace.organizationId, userId: user.id } },
    update: { role },
    create: { organizationId: workspace.organizationId, userId: user.id, role },
  });
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role },
    create: { workspaceId: workspace.id, userId: user.id, role },
  });
  console.log(`Added ${email} to ${slug} as ${role} (organization ${workspace.organization.slug})`);
}

main().finally(() => prisma.$disconnect());

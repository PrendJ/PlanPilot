import { prisma } from "../lib/prisma";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const slug = arg("workspace");
  const role = (arg("role") || "MEMBER").toUpperCase();
  if (!email || !slug) throw new Error("Usage: npm run membership:add -- --email user@example.com --workspace team-slug [--role MEMBER]");
  const [user, workspace] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.workspace.findUnique({ where: { slug } }),
  ]);
  if (!user || !workspace) throw new Error("User or workspace not found");
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role },
    create: { workspaceId: workspace.id, userId: user.id, role },
  });
  console.log(`Added ${email} to ${slug} as ${role}`);
}

main().finally(() => prisma.$disconnect());

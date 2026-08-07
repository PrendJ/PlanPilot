import { prisma } from "../lib/prisma";
import { createWorkspace } from "../lib/workspace";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const owner = arg("owner")?.toLowerCase();
  const name = arg("name");
  const slug = arg("slug");
  const keyEnv = arg("key-env");
  if (!owner || !name) throw new Error("Usage: npm run workspace:create -- --owner you@example.com --name 'Workspace' [--slug workspace] [--key-env OPENROUTER_KEY_WORKSPACE]");
  const user = await prisma.user.findUnique({ where: { email: owner } });
  if (!user) throw new Error(`User not found: ${owner}`);
  if (!user.canCreateWorkspaces && !user.isAdmin) throw new Error("This user cannot create workspaces");
  const workspace = await createWorkspace({ name, slug, userId: user.id, openrouterKeyEnv: keyEnv });
  console.log(`Workspace created: ${workspace.name} (${workspace.slug}) | env=${workspace.openrouterKeyEnv}`);
}

main().finally(() => prisma.$disconnect());

import { prisma } from "../lib/prisma";
import { createWorkspace } from "../lib/workspace";
import { ensureDefaultOrganization } from "../lib/default-organization";

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
  const organization = await ensureDefaultOrganization(user.id);
  const workspace = await createWorkspace({ name, slug, userId: user.id, organizationId: organization.id, openrouterKeyEnv: keyEnv });
  console.log(`Workspace created: ${workspace.name} (${workspace.slug}) | env=${workspace.openrouterKeyEnv}`);
}

main().finally(() => prisma.$disconnect());

import { prisma } from "../lib/prisma";
import { ensureDefaultOrganization } from "../lib/default-organization";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  if (!email) {
    throw new Error("Usage: npm run user:promote-superadmin -- --email person@example.com");
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!existing) throw new Error(`No user found for ${email}. Create the account first with npm run user:create.`);

  const user = await prisma.user.update({
    where: { email },
    data: {
      platformRole: "SUPERADMIN",
      isAdmin: true,
      emailVerifiedAt: new Date(),
      lifecycleStatus: "ACTIVE",
      suspendedAt: null,
      archivedAt: null,
      deleteAfter: null,
    },
    select: { email: true, platformRole: true, emailVerifiedAt: true, lifecycleStatus: true },
  });
  await ensureDefaultOrganization(existing.id);

  console.log(`User promoted: ${user.email} | platformRole=${user.platformRole} | verified=${Boolean(user.emailVerifiedAt)} | status=${user.lifecycleStatus}`);
}

main().finally(() => prisma.$disconnect());

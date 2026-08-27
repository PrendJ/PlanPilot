import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { createOrganization } from "../lib/workspace";
import { ensureDefaultOrganization } from "../lib/default-organization";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const password = arg("password");
  const name = arg("name") || email?.split("@")[0] || "User";
  const isAdmin = process.argv.includes("--admin");
  if (!email || !password) {
    throw new Error("Usage: npm run user:create -- --email you@example.com --password '...' [--name 'Name'] [--admin]");
  }
  if (password.length < 10) throw new Error("Password must be at least 10 characters");
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, isAdmin, platformRole: isAdmin ? "SUPERADMIN" : "USER", emailVerifiedAt: new Date(), lifecycleStatus: "ACTIVE", suspendedAt: null, archivedAt: null, deleteAfter: null },
    create: { email, name, passwordHash, isAdmin, platformRole: isAdmin ? "SUPERADMIN" : "USER", emailVerifiedAt: new Date() },
  });
  let organization = await prisma.organization.findFirst({ where: { createdById: user.id }, orderBy: { createdAt: "asc" } });
  if (!organization) organization = await createOrganization({ name, userId: user.id, legalType: "PERSONAL" });
  await ensureDefaultOrganization(user.id);
  console.log(`User ready: ${user.email} | platformRole=${user.platformRole} | organization=${organization.slug}`);
}

main().finally(() => prisma.$disconnect());

import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { createWorkspace } from "../lib/workspace";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "change-me-now";
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Admin", passwordHash, isAdmin: true, canCreateWorkspaces: true },
  });
  const existing = await prisma.workspace.findUnique({ where: { slug: "personal" } });
  if (!existing) await createWorkspace({ name: "Personal", slug: "personal", userId: user.id });
  console.log(`Seeded ${email}`);
}
main().finally(() => prisma.$disconnect());

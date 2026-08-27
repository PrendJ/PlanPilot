import { prisma } from "../lib/prisma";
import { ensureDefaultOrganization } from "../lib/default-organization";

async function main() {
  const users = await prisma.user.findMany({
    where: { lifecycleStatus: { not: "ARCHIVED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, defaultOrganizationId: true },
  });
  let provisioned = 0;
  for (const user of users) {
    await ensureDefaultOrganization(user.id);
    if (!user.defaultOrganizationId) provisioned++;
  }
  console.log(`Default organizations checked: ${users.length}; provisioned: ${provisioned}`);
}

main().finally(() => prisma.$disconnect());

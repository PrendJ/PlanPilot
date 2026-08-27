import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const migrationName = "0006_platform_backoffice";

async function main() {
  const failed = await prisma.$queryRawUnsafe(
    `SELECT "id" FROM "_prisma_migrations"
     WHERE "migration_name" = $1
       AND "finished_at" IS NULL
       AND "rolled_back_at" IS NULL`,
    migrationName,
  );

  if (!Array.isArray(failed) || failed.length === 0) {
    console.log(`[migration recovery] ${migrationName}: no active failed record`);
    return;
  }

  if (failed.length !== 1) {
    throw new Error(`[migration recovery] ${migrationName}: expected one failed record, found ${failed.length}`);
  }

  console.log(`[migration recovery] ${migrationName}: cleaning partial schema objects`);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "ComplianceAcknowledgement"`);
    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "RetainedRecord"`);

    await tx.$executeRawUnsafe(`ALTER TABLE "Workspace"
      DROP COLUMN IF EXISTS "deleteAfter",
      DROP COLUMN IF EXISTS "archivedAt",
      DROP COLUMN IF EXISTS "suspendedAt",
      DROP COLUMN IF EXISTS "lifecycleStatus"`);

    await tx.$executeRawUnsafe(`ALTER TABLE "Organization"
      DROP COLUMN IF EXISTS "archivedAt",
      DROP COLUMN IF EXISTS "suspendedAt",
      DROP COLUMN IF EXISTS "lifecycleStatus",
      DROP COLUMN IF EXISTS "licenseSource"`);

    await tx.$executeRawUnsafe(`ALTER TABLE "User"
      DROP COLUMN IF EXISTS "deleteAfter",
      DROP COLUMN IF EXISTS "archivedAt",
      DROP COLUMN IF EXISTS "suspendedAt",
      DROP COLUMN IF EXISTS "lifecycleStatus",
      DROP COLUMN IF EXISTS "platformRole"`);

    await tx.$executeRawUnsafe(`DROP TYPE IF EXISTS "LicenseSource"`);
    await tx.$executeRawUnsafe(`DROP TYPE IF EXISTS "LifecycleStatus"`);
    await tx.$executeRawUnsafe(`DROP TYPE IF EXISTS "PlatformRole"`);

    const updated = await tx.$executeRawUnsafe(
      `UPDATE "_prisma_migrations"
       SET "rolled_back_at" = CURRENT_TIMESTAMP
       WHERE "migration_name" = $1
         AND "finished_at" IS NULL
         AND "rolled_back_at" IS NULL`,
      migrationName,
    );
    if (updated !== 1) throw new Error(`[migration recovery] ${migrationName}: failed to mark exactly one record as rolled back`);
  });

  console.log(`[migration recovery] ${migrationName}: recovery completed`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

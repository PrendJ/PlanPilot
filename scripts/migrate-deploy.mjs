// Applies pending migrations at container start. `prisma migrate deploy` already skips applied migrations,
// so repeated deploys are no-ops. When a deploy was interrupted mid-migration, Prisma blocks every later
// deploy until an operator intervenes. This script lifts that block automatically only for migrations
// whose SQL starts with the "-- Idempotent" marker (re-runnable, additive, never dropping data), and
// retries once. Any other failed migration still stops the boot for operator review.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = "-- Idempotent";

export function isIdempotentMigration(name, read = file => readFileSync(file, "utf8")) {
  if (!/^[\w-]+$/.test(name)) return false;
  const file = path.join(root, "prisma", "migrations", name, "migration.sql");
  return existsSync(file) && read(file).trimStart().startsWith(MARKER);
}

/** The failed migrations that may be marked rolled back and re-run, or null if any needs a human. */
export function retryableFailures(failedNames, isIdempotent = isIdempotentMigration) {
  if (!failedNames.length || !failedNames.every(name => isIdempotent(name))) return null;
  return failedNames;
}

function prisma(args) {
  const cli = path.join(root, "node_modules", "prisma", "build", "index.js");
  return spawnSync(process.execPath, [cli, ...args], { stdio: "inherit", cwd: root }).status === 0;
}

async function failedMigrations() {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient();
  try {
    const rows = await client.$queryRawUnsafe(
      `SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL`,
    );
    return rows.map(row => row.migration_name);
  } catch {
    return [];
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  if (prisma(["migrate", "deploy"])) return 0;
  const failed = await failedMigrations();
  const retry = retryableFailures(failed);
  if (!retry) {
    console.error(
      failed.length
        ? `[migrate] failed migrations need operator review: ${failed.join(", ")}`
        : "[migrate] migrate deploy failed without a failed migration record (database unreachable?)",
    );
    return 1;
  }
  for (const name of retry) {
    console.log(`[migrate] ${name} is idempotent: marking the interrupted run as rolled back and re-applying`);
    if (!prisma(["migrate", "resolve", "--rolled-back", name])) return 1;
  }
  return prisma(["migrate", "deploy"]) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => process.exit(code));
}

BEGIN;

CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPPORT', 'BILLING', 'SUPERADMIN');
CREATE TYPE "LifecycleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "LicenseSource" AS ENUM ('TRIAL', 'MANUAL', 'STRIPE', 'LIFETIME');

ALTER TABLE "User"
  ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN "lifecycleStatus" "LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "deleteAfter" TIMESTAMP(3);
UPDATE "User" SET "platformRole" = 'SUPERADMIN' WHERE "isAdmin" = true;

ALTER TABLE "Organization"
  ADD COLUMN "licenseSource" "LicenseSource" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "lifecycleStatus" "LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3);
UPDATE "Organization"
SET "licenseSource" = CASE
  WHEN "plan" = 'LIFETIME' THEN 'LIFETIME'::"LicenseSource"
  WHEN "plan" IN ('SOLO', 'TEAM', 'STUDIO', 'ENTERPRISE') THEN 'STRIPE'::"LicenseSource"
  ELSE 'TRIAL'::"LicenseSource"
END;
CREATE INDEX "Organization_lifecycleStatus_deleteAfter_idx" ON "Organization"("lifecycleStatus", "deleteAfter");

ALTER TABLE "Workspace"
  ADD COLUMN "lifecycleStatus" "LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "deleteAfter" TIMESTAMP(3);
CREATE INDEX "Workspace_lifecycleStatus_deleteAfter_idx" ON "Workspace"("lifecycleStatus", "deleteAfter");

INSERT INTO "OrganizationMember" ("id", "organizationId", "userId", "role", "createdAt")
SELECT 'backfill_' || "WorkspaceMember"."id", "Workspace"."organizationId", "WorkspaceMember"."userId",
  CASE WHEN "WorkspaceMember"."role" = 'OWNER' THEN 'ADMIN' ELSE "WorkspaceMember"."role" END, CURRENT_TIMESTAMP
FROM "WorkspaceMember" JOIN "Workspace" ON "Workspace"."id" = "WorkspaceMember"."workspaceId"
ON CONFLICT ("organizationId", "userId") DO NOTHING;

CREATE TABLE "RetainedRecord" (
  "id" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RetainedRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RetainedRecord_subjectType_subjectId_idx" ON "RetainedRecord"("subjectType", "subjectId");
CREATE INDEX "RetainedRecord_expiresAt_idx" ON "RetainedRecord"("expiresAt");

CREATE TABLE "ComplianceAcknowledgement" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "policyKey" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplianceAcknowledgement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComplianceAcknowledgement_userId_policyKey_version_key" ON "ComplianceAcknowledgement"("userId", "policyKey", "version");
ALTER TABLE "ComplianceAcknowledgement" ADD CONSTRAINT "ComplianceAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

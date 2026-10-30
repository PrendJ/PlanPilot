-- Additive migration: existing boards and direct memberships remain intact.
ALTER TABLE "User" ADD COLUMN "activeOrganizationId" TEXT;
UPDATE "User" SET "activeOrganizationId" = "defaultOrganizationId";
ALTER TABLE "Card" ADD COLUMN "previousColumnId" TEXT;
CREATE TABLE "Space" (
 "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Space_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Space_organizationId_idx" ON "Space"("organizationId");
CREATE TABLE "SpaceMember" (
 "id" TEXT NOT NULL PRIMARY KEY, "spaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'MEMBER',
 CONSTRAINT "SpaceMember_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "SpaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SpaceMember_spaceId_userId_key" ON "SpaceMember"("spaceId", "userId");
CREATE INDEX "SpaceMember_userId_idx" ON "SpaceMember"("userId");
ALTER TABLE "Workspace" ADD COLUMN "spaceId" TEXT;
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Workspace_spaceId_idx" ON "Workspace"("spaceId");
ALTER TABLE "WorkspaceMember" ADD COLUMN "inheritedFromSpaceId" TEXT;

ALTER TABLE "WorkspaceInvite" ADD COLUMN "spaceId" TEXT;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Organization" ADD COLUMN "billingPricingVersion" TEXT;

-- Preserve title-based completion for old custom columns, then make explicit state authoritative.
UPDATE "BoardColumn" SET "semanticKey" = 'DONE'
WHERE "semanticKey" = 'CUSTOM' AND title ~* '\m(done|fatto|completat|consegnat|pubblicat|chius|erledigt|termin|hecho|complet|ukończ|zrobion|заверш|сделан)';

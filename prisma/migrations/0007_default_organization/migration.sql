-- Every user may designate one organization as their operational default.
ALTER TABLE "User" ADD COLUMN "defaultOrganizationId" TEXT;
ALTER TABLE "User" DROP COLUMN "canCreateWorkspaces";

CREATE UNIQUE INDEX "User_defaultOrganizationId_key" ON "User"("defaultOrganizationId");

ALTER TABLE "User"
ADD CONSTRAINT "User_defaultOrganizationId_fkey"
FOREIGN KEY ("defaultOrganizationId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Organization" ADD COLUMN "accessExpiresAt" TIMESTAMP(3);
CREATE INDEX "Organization_accessExpiresAt_idx" ON "Organization"("accessExpiresAt");

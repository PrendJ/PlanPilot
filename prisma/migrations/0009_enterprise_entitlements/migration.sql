ALTER TABLE "Organization"
ADD COLUMN "memberLimitOverride" INTEGER,
ADD COLUMN "workspaceLimitOverride" INTEGER,
ADD COLUMN "aiBudgetUsdOverride" DOUBLE PRECISION;

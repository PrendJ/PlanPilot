-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoApplyAi" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoSendDictation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailDigest" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastDigestAt" TIMESTAMP(3),
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpRecoveryCodes" JSONB,
ADD COLUMN     "totpSecretEnc" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "aiUpdatesOverride" INTEGER,
ADD COLUMN     "billingAddress" JSONB,
ADD COLUMN     "billingInterval" TEXT,
ADD COLUMN     "billingName" TEXT,
ADD COLUMN     "firstAiUpdateAt" TIMESTAMP(3),
ADD COLUMN     "firstBoardAt" TIMESTAMP(3),
ADD COLUMN     "firstCardMovedAt" TIMESTAMP(3),
ADD COLUMN     "firstInviteAt" TIMESTAMP(3),
ADD COLUMN     "firstVoiceAt" TIMESTAMP(3),
ADD COLUMN     "fiscalCode" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "pecEmail" TEXT,
ADD COLUMN     "require2fa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sdiCode" TEXT,
ADD COLUMN     "trialNudgesSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "seats" INTEGER,
ADD COLUMN     "vatNumber" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ALTER COLUMN "planModel" SET DEFAULT 'google/gemini-2.5-flash-lite',
ALTER COLUMN "transcriptionModel" SET DEFAULT 'mistralai/voxtral-mini-transcribe';

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "checklist" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "dueReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "UsageEvent" ADD COLUMN     "fromCredits" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "units" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CardComment" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" JSONB NOT NULL DEFAULT '[]',
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "cardId" TEXT,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProposal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "actions" JSONB NOT NULL,
    "clarification" JSONB,
    "baseRevision" INTEGER NOT NULL,
    "cardVersions" JSONB NOT NULL DEFAULT '{}',
    "model" TEXT NOT NULL,
    "cost" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "updateLogId" TEXT,
    "receipt" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "stripeSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ProductEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'json',
    "secret" TEXT NOT NULL,
    "events" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardComment_cardId_createdAt_idx" ON "CardComment"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "CardComment_workspaceId_idx" ON "CardComment"("workspaceId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_emailedAt_createdAt_idx" ON "Notification"("emailedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiProposal_updateLogId_key" ON "AiProposal"("updateLogId");

-- CreateIndex
CREATE INDEX "AiProposal_workspaceId_createdAt_idx" ON "AiProposal"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AiProposal_status_expiresAt_idx" ON "AiProposal"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditGrant_stripeSessionId_key" ON "CreditGrant"("stripeSessionId");

-- CreateIndex
CREATE INDEX "CreditGrant_organizationId_remaining_idx" ON "CreditGrant"("organizationId", "remaining");

-- CreateIndex
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEvent_name_day_key" ON "ProductEvent"("name", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");

-- CreateIndex
CREATE INDEX "Webhook_workspaceId_idx" ON "Webhook"("workspaceId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_deliveredAt_availableAt_idx" ON "WebhookDelivery"("deliveredAt", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoginToken_tokenHash_key" ON "LoginToken"("tokenHash");

-- CreateIndex
CREATE INDEX "LoginToken_userId_expiresAt_idx" ON "LoginToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorChallenge_tokenHash_key" ON "TwoFactorChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "TwoFactorChallenge_userId_idx" ON "TwoFactorChallenge"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "CardComment" ADD CONSTRAINT "CardComment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardComment" ADD CONSTRAINT "CardComment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardComment" ADD CONSTRAINT "CardComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposal" ADD CONSTRAINT "AiProposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposal" ADD CONSTRAINT "AiProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginToken" ADD CONSTRAINT "LoginToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorChallenge" ADD CONSTRAINT "TwoFactorChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: AI routing uses zero-retention OpenRouter endpoints; workspaces on models no longer offered get the default.
UPDATE "Workspace" SET "planModel" = 'google/gemini-2.5-flash-lite'
  WHERE "planModel" NOT IN ('google/gemini-2.5-flash-lite', 'openai/gpt-5-nano', 'mistralai/mistral-small-2603', 'google/gemini-2.5-flash');
UPDATE "Workspace" SET "transcriptionModel" = 'mistralai/voxtral-mini-transcribe'
  WHERE "transcriptionModel" <> 'mistralai/voxtral-mini-transcribe';

-- Data: organizations that stop paying (or finish the trial) are frozen read-only, never deleted automatically.
UPDATE "Organization" SET "deleteAfter" = NULL
  WHERE "lifecycleStatus" = 'ACTIVE' AND "deleteAfter" IS NOT NULL;

-- Data: activation timestamps for existing organizations.
UPDATE "Organization" o SET "firstBoardAt" = sub.first
  FROM (SELECT "organizationId", MIN("createdAt") AS first FROM "Workspace" GROUP BY "organizationId") sub
  WHERE sub."organizationId" = o."id" AND o."firstBoardAt" IS NULL;
UPDATE "Organization" o SET "firstAiUpdateAt" = sub.first
  FROM (SELECT w."organizationId", MIN(l."createdAt") AS first FROM "UpdateLog" l JOIN "Workspace" w ON w."id" = l."workspaceId" GROUP BY w."organizationId") sub
  WHERE sub."organizationId" = o."id" AND o."firstAiUpdateAt" IS NULL;

-- Billing: remember plan and customer type of each Stripe subscription (prices are provisioned by the app).
ALTER TABLE "Subscription" ADD COLUMN "plan" TEXT,
ADD COLUMN "customerType" TEXT;

-- Data: the previous flat Team plan (EUR 24, up to 10 people) becomes TEAM_LEGACY; "TEAM" is now per seat.
UPDATE "Organization" SET "plan" = 'TEAM_LEGACY' WHERE "plan" = 'TEAM';

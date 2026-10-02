-- Idempotent: safe to re-run after an interrupted deploy (see scripts/migrate-deploy.mjs).
-- Telegram captures: bounded automatic retries.
ALTER TABLE "ExternalCapture" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

-- Platform-wide AI models, chosen by the superadmin instead of per board.
CREATE TABLE IF NOT EXISTS "PlatformAiSetting" (
  "id" TEXT NOT NULL,
  "planModel" TEXT NOT NULL,
  "transcriptionModel" TEXT NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformAiSetting_pkey" PRIMARY KEY ("id")
);

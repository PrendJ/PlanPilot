ALTER TABLE "PlatformAiSetting"
  ADD COLUMN "complexPlanModel" TEXT NOT NULL DEFAULT 'openai/gpt-5-mini';

UPDATE "PlatformAiSetting" SET "planModel" = 'openai/gpt-5-nano'
  WHERE "planModel" LIKE 'google/%';

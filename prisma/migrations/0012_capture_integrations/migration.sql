-- Idempotent: safe to re-run after an interrupted deploy (see scripts/migrate-deploy.mjs).
CREATE TABLE IF NOT EXISTS "TelegramConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramConnection_userId_key" ON "TelegramConnection"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramConnection_chatId_key" ON "TelegramConnection"("chatId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TelegramConnection_userId_fkey') THEN
    ALTER TABLE "TelegramConnection" ADD CONSTRAINT "TelegramConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "TelegramLinkRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramLinkRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramLinkRequest_userId_key" ON "TelegramLinkRequest"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramLinkRequest_tokenHash_key" ON "TelegramLinkRequest"("tokenHash");
CREATE INDEX IF NOT EXISTS "TelegramLinkRequest_expiresAt_idx" ON "TelegramLinkRequest"("expiresAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TelegramLinkRequest_userId_fkey') THEN
    ALTER TABLE "TelegramLinkRequest" ADD CONSTRAINT "TelegramLinkRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ExternalCapture" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "text" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'READY',
  "telegramUpdateId" TEXT,
  "telegramFileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalCapture_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalCapture_telegramUpdateId_key" ON "ExternalCapture"("telegramUpdateId");
CREATE INDEX IF NOT EXISTS "ExternalCapture_userId_status_createdAt_idx" ON "ExternalCapture"("userId", "status", "createdAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExternalCapture_userId_fkey') THEN
    ALTER TABLE "ExternalCapture" ADD CONSTRAINT "ExternalCapture_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CalendarFeed" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "timeZone" TEXT NOT NULL DEFAULT 'Europe/Rome',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarFeed_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarFeed_userId_key" ON "CalendarFeed"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarFeed_tokenHash_key" ON "CalendarFeed"("tokenHash");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarFeed_userId_fkey') THEN
    ALTER TABLE "CalendarFeed" ADD CONSTRAINT "CalendarFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE "ExchangeRateSetting" (
  "id" TEXT NOT NULL,
  "manualUsdToEur" DOUBLE PRECISION,
  "manualSetAt" TIMESTAMP(3),
  "manualSetById" TEXT,
  "latestUsdToEur" DOUBLE PRECISION,
  "latestSource" TEXT,
  "latestObservedAt" TIMESTAMP(3),
  "latestFetchedAt" TIMESTAMP(3),
  "lastFetchError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExchangeRateSetting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExchangeRateSetting_manualSetById_idx" ON "ExchangeRateSetting"("manualSetById");

ALTER TABLE "ExchangeRateSetting"
  ADD CONSTRAINT "ExchangeRateSetting_manualSetById_fkey"
  FOREIGN KEY ("manualSetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

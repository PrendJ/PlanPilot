CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushSubscription_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_sessionId_idx" ON "PushSubscription"("sessionId");
CREATE TABLE "PushDelivery" (
  "id" TEXT NOT NULL, "subscriptionId" TEXT NOT NULL, "eventId" TEXT NOT NULL, "dedupKey" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3), "leaseToken" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PushDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ActivityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PushDelivery_subscriptionId_dedupKey_key" ON "PushDelivery"("subscriptionId", "dedupKey");
CREATE INDEX "PushDelivery_availableAt_leaseUntil_idx" ON "PushDelivery"("availableAt", "leaseUntil");

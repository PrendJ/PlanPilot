ALTER TABLE "User" ADD COLUMN "lifetimeFree" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lifetimeFreeGrantedAt" TIMESTAMP(3),
ADD COLUMN "lifetimeFreeGrantedBy" TEXT;

CREATE TABLE "AdminAuditEvent" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAuditEvent_createdAt_idx" ON "AdminAuditEvent"("createdAt");
CREATE INDEX "AdminAuditEvent_targetType_targetId_idx" ON "AdminAuditEvent"("targetType", "targetId");
ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "verificationReminderSentAt" TIMESTAMP(3);
CREATE INDEX "User_emailVerifiedAt_verificationReminderSentAt_createdAt_idx" ON "User"("emailVerifiedAt", "verificationReminderSentAt", "createdAt");

ALTER TABLE "Organization" ADD COLUMN "trialExpirationEmailSentAt" TIMESTAMP(3);
CREATE INDEX "Organization_plan_trialEndsAt_trialExpirationEmailSentAt_idx" ON "Organization"("plan", "trialEndsAt", "trialExpirationEmailSentAt");

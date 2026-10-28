import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { createOpaqueToken, hashToken } from "@/lib/auth";

export async function lockIdentity(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

/** Call under the user lock before committing a sensitive session mutation. */
export async function identitySessionIsCurrent(tx: Prisma.TransactionClient, session: { id: string; userId: string; user: { passwordHash: string } }) {
  const current = await tx.session.findFirst({ where: { id: session.id, userId: session.userId, expiresAt: { gt: new Date() }, user: { lifecycleStatus: "ACTIVE", passwordHash: session.user.passwordHash } }, select: { id: true } });
  return Boolean(current);
}

/** Caller holds the user lock. Account recovery invalidates every login channel. */
export async function revokeCredentials(tx: Prisma.TransactionClient, userId: string, keepSessionId?: string) {
  await tx.session.deleteMany({ where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } });
  await tx.apiToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await tx.loginToken.deleteMany({ where: { userId } });
  await tx.twoFactorChallenge.deleteMany({ where: { userId } });
  await tx.passwordResetToken.deleteMany({ where: { userId } });
  await tx.calendarFeed.deleteMany({ where: { userId } });
  await tx.telegramLinkRequest.deleteMany({ where: { userId } });
  await tx.telegramConnection.deleteMany({ where: { userId } });
}

/** Retire credentials chosen before the first proof of mailbox ownership. */
export async function claimEmailIdentity(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return null;
  if (user.lifecycleStatus !== "ACTIVE") throw new Error("IDENTITY_INACTIVE");
  await revokeCredentials(tx, userId);
  await tx.webhook.updateMany({ where: { createdById: userId }, data: { active: false } });
  await tx.verificationToken.deleteMany({ where: { userId } });
  await tx.user.update({ where: { id: userId }, data: {
    emailVerifiedAt: new Date(), passwordHash: await bcrypt.hash(createOpaqueToken(), 12),
    totpEnabledAt: null, totpSecretEnc: null, totpLastStep: null, totpRecoveryCodes: Prisma.DbNull,
    autoApplyAi: false, autoSendDictation: false,
  } });
  const token = createOpaqueToken();
  await tx.passwordResetToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 15 * 60_000) } });
  return token;
}

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createOpaqueToken, CredentialsChangedError, hashToken, startSession, TWO_FACTOR_COOKIE } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { consumeRecoveryCode, verifyTotp } from "@/lib/totp";

const CHALLENGE_MINUTES = 5;
const MAX_ATTEMPTS = 5;

/** After a correct password (or magic link) a short-lived challenge replaces the session until the code is entered. */
export async function beginTwoFactor(userId: string, expectedPasswordHash?: string) {
  const token = createOpaqueToken();
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.lifecycleStatus !== "ACTIVE" || (expectedPasswordHash && user.passwordHash !== expectedPasswordHash)) throw new CredentialsChangedError();
    await tx.twoFactorChallenge.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] } });
    await tx.twoFactorChallenge.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000) } });
  });
  (await cookies()).set(TWO_FACTOR_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_MINUTES * 60,
  });
}

/** Verifies a TOTP code for a user and stores the step to prevent replay. */
export async function checkUserCode(
  user: { id: string; totpSecretEnc: string | null; totpLastStep: number | null; totpRecoveryCodes: unknown },
  code: string,
) {
  if (!user.totpSecretEnc) return false;
  const step = verifyTotp(decryptSecret(user.totpSecretEnc), code, { lastStep: user.totpLastStep });
  if (step !== null) {
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, totpSecretEnc: user.totpSecretEnc, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return claimed.count > 0;
  }
  const remaining = consumeRecoveryCode(user.totpRecoveryCodes, code);
  if (!remaining) return false;
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, totpSecretEnc: user.totpSecretEnc, totpRecoveryCodes: { equals: user.totpRecoveryCodes as string[] } },
    data: { totpRecoveryCodes: remaining },
  });
  return claimed.count > 0;
}

export async function completeTwoFactor(code: string) {
  const jar = await cookies();
  const token = jar.get(TWO_FACTOR_COOKIE)?.value;
  if (!token) return { ok: false as const, reason: "EXPIRED" as const };
  const challenge = await prisma.twoFactorChallenge.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!challenge || challenge.expiresAt < new Date() || challenge.attempts >= MAX_ATTEMPTS || challenge.user.lifecycleStatus !== "ACTIVE") {
    jar.set(TWO_FACTOR_COOKIE, "", { path: "/", expires: new Date(0) });
    return { ok: false as const, reason: "EXPIRED" as const };
  }
  const attempt = await prisma.twoFactorChallenge.updateMany({ where: { id: challenge.id, attempts: { lt: MAX_ATTEMPTS }, expiresAt: { gt: new Date() } }, data: { attempts: { increment: 1 } } });
  if (!attempt.count) return { ok: false as const, reason: "EXPIRED" as const };
  if (!(await checkUserCode(challenge.user, code))) return { ok: false as const, reason: "INVALID" as const };
  const claimed = await prisma.twoFactorChallenge.deleteMany({ where: { id: challenge.id } });
  if (!claimed.count) return { ok: false as const, reason: "EXPIRED" as const };
  jar.set(TWO_FACTOR_COOKIE, "", { path: "/", expires: new Date(0) });
  try { await startSession(challenge.user.id, challenge.user); }
  catch (error) { if (error instanceof CredentialsChangedError) return { ok: false as const, reason: "EXPIRED" as const }; throw error; }
  return { ok: true as const, userId: challenge.user.id };
}

export async function pendingTwoFactor() {
  const token = (await cookies()).get(TWO_FACTOR_COOKIE)?.value;
  if (!token) return false;
  const challenge = await prisma.twoFactorChallenge.findUnique({ where: { tokenHash: hashToken(token) }, select: { expiresAt: true } });
  return Boolean(challenge && challenge.expiresAt > new Date());
}

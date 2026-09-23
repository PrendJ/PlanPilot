import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createOpaqueToken, hashToken, startSession, TWO_FACTOR_COOKIE } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { consumeRecoveryCode, verifyTotp } from "@/lib/totp";

const CHALLENGE_MINUTES = 5;
const MAX_ATTEMPTS = 5;

/** After a correct password (or magic link) a short-lived challenge replaces the session until the code is entered. */
export async function beginTwoFactor(userId: string) {
  const token = createOpaqueToken();
  await prisma.twoFactorChallenge.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] } });
  await prisma.twoFactorChallenge.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000) },
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
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return claimed.count > 0;
  }
  const remaining = consumeRecoveryCode(user.totpRecoveryCodes, code);
  if (!remaining) return false;
  await prisma.user.update({ where: { id: user.id }, data: { totpRecoveryCodes: remaining } });
  return true;
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
  await prisma.twoFactorChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
  if (!(await checkUserCode(challenge.user, code))) return { ok: false as const, reason: "INVALID" as const };
  await prisma.twoFactorChallenge.delete({ where: { id: challenge.id } });
  jar.set(TWO_FACTOR_COOKIE, "", { path: "/", expires: new Date(0) });
  await startSession(challenge.user.id);
  return { ok: true as const, userId: challenge.user.id };
}

export async function pendingTwoFactor() {
  const token = (await cookies()).get(TWO_FACTOR_COOKIE)?.value;
  if (!token) return false;
  const challenge = await prisma.twoFactorChallenge.findUnique({ where: { tokenHash: hashToken(token) }, select: { expiresAt: true } });
  return Boolean(challenge && challenge.expiresAt > new Date());
}

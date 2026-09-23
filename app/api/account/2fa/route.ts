import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";
import { decryptSecret, encryptionConfigured, encryptSecret } from "@/lib/crypto";
import { generateRecoveryCodes, generateTotpSecret, otpauthUri, verifyTotp } from "@/lib/totp";
import { checkUserCode } from "@/lib/two-factor";

/** Step 1: create a pending secret (inactive until confirmed with a valid code). */
export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return apiError(request, "UNAUTHORIZED", 401);
  if (!encryptionConfigured()) return apiError(request, "SERVER_ERROR", 503);
  if (session.user.totpEnabledAt)
    return NextResponse.json({
      enabled: true,
      recoveryCodesLeft: Array.isArray(session.user.totpRecoveryCodes) ? session.user.totpRecoveryCodes.length : 0,
    });
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: session.userId }, data: { totpSecretEnc: encryptSecret(secret), totpLastStep: null } });
  const uri = otpauthUri({ secret, account: session.user.email });
  const qr = await QRCode.toString(uri, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#12151C", light: "#FFFFFF" },
  });
  return NextResponse.json({ enabled: false, secret, uri, qr });
}

/** Step 2: confirm with a code → enable and return one-time recovery codes. When already enabled, regenerates codes. */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const limited = await rateLimit(`2fa-setup:${session.userId}`, 10, 15 * 60_000, request);
  if (limited) return limited;
  const parsed = z.object({ code: z.string().trim().min(6).max(20) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "TWO_FACTOR_INVALID", 400);
  const user = session.user;
  if (!user.totpSecretEnc) return apiError(request, "TWO_FACTOR_INVALID", 400);
  if (user.totpEnabledAt) {
    if (!(await checkUserCode(user, parsed.data.code))) return apiError(request, "TWO_FACTOR_INVALID", 400);
  } else {
    const step = verifyTotp(decryptSecret(user.totpSecretEnc), parsed.data.code);
    if (step === null) return apiError(request, "TWO_FACTOR_INVALID", 400);
    await prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
  }
  const { codes, hashes } = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: user.totpEnabledAt || new Date(), totpRecoveryCodes: hashes } }),
    // Enabling 2FA invalidates other sessions opened with the password alone.
    prisma.session.deleteMany({ where: { userId: user.id, id: { not: session.id } } }),
  ]);
  return NextResponse.json({ enabled: true, recoveryCodes: codes });
}

/** Disable: password + current code (or recovery code). Not allowed while a team requires 2FA. */
export async function DELETE(request: Request) {
  const session = await getCurrentSession();
  if (!session) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const parsed = z
    .object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(20) })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const user = session.user;
  if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) return apiError(request, "INVALID_CREDENTIALS", 400);
  if (!(await checkUserCode(user, parsed.data.code))) return apiError(request, "TWO_FACTOR_INVALID", 400);
  const required = await prisma.organizationMember.findFirst({
    where: { userId: user.id, organization: { require2fa: true, lifecycleStatus: "ACTIVE" } },
    select: { id: true },
  });
  if (required) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 409);
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: null, totpSecretEnc: null, totpRecoveryCodes: Prisma.DbNull, totpLastStep: null },
  });
  return NextResponse.json({ enabled: false });
}

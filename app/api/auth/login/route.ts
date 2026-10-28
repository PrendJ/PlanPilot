import { safeJson } from "@/lib/security";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CredentialsChangedError, startSession } from "@/lib/auth";
import { clientIp, rateLimit, rejectCrossOrigin } from "@/lib/security";
import { ensureDefaultOrganization } from "@/lib/default-organization";
import { beginTwoFactor } from "@/lib/two-factor";
import { apiError } from "@/lib/errors";

const schema = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(200) });

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const limited = await rateLimit(`login:${clientIp(request)}`, 10, 15 * 60_000, request);
  if (limited) return limited;
  const parsed = schema.safeParse(await safeJson(request));
  if (!parsed.success) return apiError(request, "INVALID_CREDENTIALS", 401);
  const email = parsed.data.email.toLowerCase();
  // Per-account limit too: stops slow distributed guessing on one address.
  const accountLimited = await rateLimit(`login-account:${email}`, 20, 60 * 60_000, request);
  if (accountLimited) return accountLimited;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return apiError(request, "INVALID_CREDENTIALS", 401);
  if (user.lifecycleStatus !== "ACTIVE") return apiError(request, "ACCOUNT_INACTIVE", 403);
  await ensureDefaultOrganization(user.id);
  try {
  if (user.totpEnabledAt) {
    await beginTwoFactor(user.id, user.passwordHash);
    return NextResponse.json({ ok: true, twoFactorRequired: true });
  }
  await startSession(user.id, user);
  return NextResponse.json({ ok: true, twoFactorRequired: false });
  } catch (error) { if (error instanceof CredentialsChangedError) return apiError(request, "INVALID_CREDENTIALS", 401); throw error; }
}

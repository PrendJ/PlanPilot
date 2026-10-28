import { safeJson } from "@/lib/security";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";
import { identitySessionIsCurrent, lockIdentity, revokeCredentials } from "@/lib/identity";

/** Changing the password signs out every other device. */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const limited = await rateLimit(`password:${session.userId}`, 5, 15 * 60_000, request);
  if (limited) return limited;
  const parsed = z
    .object({ current: z.string().min(1).max(200), next: z.string().min(10).max(200) })
    .safeParse(await safeJson(request));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  if (!(await bcrypt.compare(parsed.data.current, session.user.passwordHash))) return apiError(request, "INVALID_CREDENTIALS", 400);
  const passwordHash = await bcrypt.hash(parsed.data.next, 12);
  const changed = await prisma.$transaction(async tx => {
    await lockIdentity(tx, session.userId);
    if (!(await identitySessionIsCurrent(tx, session))) return false;
    await tx.user.update({ where: { id: session.userId }, data: { passwordHash } });
    await revokeCredentials(tx, session.userId, session.id);
    return true;
  });
  if (!changed) return apiError(request, "UNAUTHORIZED", 401);
  return NextResponse.json({ ok: true });
}

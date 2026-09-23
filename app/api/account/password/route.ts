import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";

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
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  if (!(await bcrypt.compare(parsed.data.current, session.user.passwordHash))) return apiError(request, "INVALID_CREDENTIALS", 400);
  await prisma.$transaction([
    prisma.user.update({ where: { id: session.userId }, data: { passwordHash: await bcrypt.hash(parsed.data.next, 12) } }),
    prisma.session.deleteMany({ where: { userId: session.userId, id: { not: session.id } } }),
  ]);
  return NextResponse.json({ ok: true });
}

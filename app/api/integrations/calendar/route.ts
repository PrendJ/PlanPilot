import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isVerified, twoFactorRequiredButMissing } from "@/lib/auth";
import { newFeedToken, feedTokenHash, validTimeZone } from "@/lib/calendar-feed";
import { appUrl } from "@/lib/email";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { rateLimit, rejectCrossOrigin } from "@/lib/security";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const feed = await prisma.calendarFeed.findUnique({ where: { userId: user.id }, select: { timeZone: true, createdAt: true } });
  return NextResponse.json({ connected: Boolean(feed), timeZone: feed?.timeZone || null });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isVerified(user)) return apiError(request, "EMAIL_NOT_VERIFIED", 403);
  if (await twoFactorRequiredButMissing(user)) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 403);
  const limited = await rateLimit(`calendar-feed:${user.id}`, 5, 60_000, request);
  if (limited) return limited;
  const parsed = z.object({ timeZone: z.string().refine(validTimeZone) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const token = newFeedToken();
  await prisma.calendarFeed.upsert({
    where: { userId: user.id },
    create: { userId: user.id, tokenHash: feedTokenHash(token), timeZone: parsed.data.timeZone },
    update: { tokenHash: feedTokenHash(token), timeZone: parsed.data.timeZone },
  });
  const url = appUrl(`/api/calendar/${token}`, request);
  return NextResponse.json({ url, webcalUrl: url.replace(/^https?:/, "webcal:") });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  await prisma.calendarFeed.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}

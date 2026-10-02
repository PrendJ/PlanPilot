import { after, NextResponse } from "next/server";
import { getCurrentUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { rateLimit, rejectCrossOrigin } from "@/lib/security";
import { MAX_CAPTURE_ATTEMPTS, processTelegramAudio } from "@/lib/telegram";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (await twoFactorRequiredButMissing(user)) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 403);
  const limited = await rateLimit(`capture-retry:${user.id}`, 5, 60_000, request);
  if (limited) return limited;
  const { id } = await params;
  const capture = await prisma.externalCapture.findFirst({
    where: { id, userId: user.id, status: "FAILED", telegramFileId: { not: null }, attempts: { lt: MAX_CAPTURE_ATTEMPTS } },
    select: { id: true },
  });
  if (!capture) return apiError(request, "INVALID_INPUT", 400);
  after(() => processTelegramAudio(capture.id));
  return NextResponse.json({ ok: true });
}

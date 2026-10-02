import { NextResponse } from "next/server";
import { getCurrentUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { MAX_CAPTURE_ATTEMPTS } from "@/lib/telegram";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  if (await twoFactorRequiredButMissing(user)) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 403);
  const rows = await prisma.externalCapture.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, source: true, text: true, status: true, createdAt: true, telegramFileId: true, attempts: true },
  });
  const captures = rows.map(({ telegramFileId, attempts, ...capture }) => ({
    ...capture,
    retryable: capture.status === "FAILED" && telegramFileId !== null && attempts < MAX_CAPTURE_ATTEMPTS,
  }));
  return NextResponse.json({ captures });
}

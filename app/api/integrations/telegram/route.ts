import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser, isVerified, twoFactorRequiredButMissing } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { rateLimit, rejectCrossOrigin } from "@/lib/security";
import { telegramConfigured, telegramTokenHash } from "@/lib/telegram";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const connection = await prisma.telegramConnection.findUnique({ where: { userId: user.id }, select: { connectedAt: true } });
  return NextResponse.json({
    configured: telegramConfigured(),
    connected: Boolean(connection),
    connectedAt: connection?.connectedAt || null,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isVerified(user)) return apiError(request, "EMAIL_NOT_VERIFIED", 403);
  if (await twoFactorRequiredButMissing(user)) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 403);
  if (!telegramConfigured()) return apiError(request, "INTEGRATION_UNAVAILABLE", 503);
  const limited = await rateLimit(`telegram-link:${user.id}`, 5, 60_000, request);
  if (limited) return limited;
  const token = randomBytes(32).toString("base64url");
  await prisma.telegramLinkRequest.upsert({
    where: { userId: user.id },
    create: { userId: user.id, tokenHash: telegramTokenHash(token), expiresAt: new Date(Date.now() + 10 * 60_000) },
    update: { tokenHash: telegramTokenHash(token), expiresAt: new Date(Date.now() + 10 * 60_000) },
  });
  const name = process.env.TELEGRAM_BOT_USERNAME!.replace(/^@/, "");
  return NextResponse.json({ url: `https://t.me/${name}?start=${token}`, expiresInSeconds: 600 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  await prisma.$transaction([
    prisma.telegramConnection.deleteMany({ where: { userId: user.id } }),
    prisma.telegramLinkRequest.deleteMany({ where: { userId: user.id } }),
  ]);
  return NextResponse.json({ ok: true });
}

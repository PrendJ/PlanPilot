import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUTO_CAPTURE_ATTEMPTS, MAX_CAPTURE_ATTEMPTS, processTelegramAudio } from "@/lib/telegram";

export const maxDuration = 120;

/** Reclaims audio left pending by an interrupted worker and retries failed transcriptions a few times. Run every 5 minutes. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stale = new Date(Date.now() - 5 * 60_000);
  // Interrupted workers that already used every attempt can no longer be claimed: settle them as failed.
  await prisma.externalCapture.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: stale }, attempts: { gte: MAX_CAPTURE_ATTEMPTS } },
    data: { status: "FAILED" },
  });
  const captures = await prisma.externalCapture.findMany({
    where: {
      telegramFileId: { not: null },
      OR: [
        { status: "PENDING", createdAt: { lt: stale } },
        { status: "PROCESSING", updatedAt: { lt: stale } },
        { status: "FAILED", attempts: { lt: AUTO_CAPTURE_ATTEMPTS }, updatedAt: { lt: stale } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  after(async () => {
    for (const capture of captures) await processTelegramAudio(capture.id);
  });
  return NextResponse.json({ queued: captures.length });
}

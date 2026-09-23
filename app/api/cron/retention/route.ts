import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshUsdToEurRate } from "@/lib/exchange-rate";
import { runAccountEmailLifecycle, runRetention } from "@/lib/lifecycle";
import { queueDueReminders, sendDigests } from "@/lib/notifications";
import { purgeRateLimits } from "@/lib/security";

function romeHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(date));
}

/** Hourly: account/trial lifecycle, retention, due-date reminders, morning digest, housekeeping. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const lifecycle = await runAccountEmailLifecycle(request);
  const retention = await runRetention();
  const reminders = await queueDueReminders(now);
  // The digest goes out once a day, in the morning (Italian time).
  const digests = romeHour(now) === 8 ? await sendDigests(request, now) : { sent: 0 };
  await prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } });
  await prisma.loginToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } });
  await prisma.twoFactorChallenge.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.workspaceInvite.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date(now.getTime() - 30 * 86400000) } }, { revokedAt: { lt: new Date(now.getTime() - 30 * 86400000) } }],
    },
  });
  await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.aiProposal.updateMany({ where: { status: "PENDING", expiresAt: { lt: now } }, data: { status: "EXPIRED" } });
  await prisma.aiProposal.deleteMany({
    where: { status: { in: ["EXPIRED", "DISCARDED"] }, createdAt: { lt: new Date(now.getTime() - 30 * 86400000) } },
  });
  await prisma.notification.deleteMany({ where: { readAt: { lt: new Date(now.getTime() - 90 * 86400000) } } });
  await purgeRateLimits();
  const exchangeRate = await refreshUsdToEurRate();
  return NextResponse.json({ ...lifecycle, ...retention, reminders, digests, exchangeRate });
}

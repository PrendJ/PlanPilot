import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth";
import { clientIp, rateLimit, rejectCrossOrigin, safeJson } from "@/lib/security";
import { claimEmailIdentity, lockIdentity, revokeCredentials } from "@/lib/identity";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return NextResponse.json({ valid: false }, { status: 400 });
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, select: { usedAt: true, expiresAt: true } });
  const valid = Boolean(record && !record.usedAt && record.expiresAt > new Date());
  return NextResponse.json({ valid }, { status: valid ? 200 : 400 });
}

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request); if (originError) return originError;
  const limited = await rateLimit(`reset-apply:${clientIp(request)}`, 20, 15 * 60_000, request); if (limited) return limited;
  const parsed = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: z.string().min(10).max(200) }).safeParse(await safeJson(request));
  if (!parsed.success) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return NextResponse.json({ error: "Link scaduto o non valido" }, { status: 400 });
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const changed = await prisma.$transaction(async tx => {
    await lockIdentity(tx, record.userId);
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() }, user: { lifecycleStatus: "ACTIVE" } }, data: { usedAt: new Date() } });
    if (!claimed.count) return false;
    await claimEmailIdentity(tx, record.userId);
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await revokeCredentials(tx, record.userId);
    return true;
  });
  return changed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Link scaduto o non valido" }, { status: 400 });
}

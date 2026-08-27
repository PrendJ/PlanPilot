import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth";
import { rejectCrossOrigin } from "@/lib/security";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || token.length < 20) return NextResponse.json({ valid: false }, { status: 400 });
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, select: { usedAt: true, expiresAt: true } });
  const valid = Boolean(record && !record.usedAt && record.expiresAt >= new Date());
  return NextResponse.json({ valid }, { status: valid ? 200 : 400 });
}

export async function POST(request: Request) { const originError = rejectCrossOrigin(request); if (originError) return originError; const parsed = z.object({ token: z.string().min(20), password: z.string().min(10).max(200) }).safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 }); const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) } }); if (!record || record.usedAt || record.expiresAt < new Date()) return NextResponse.json({ error: "Link scaduto o non valido" }, { status: 400 }); await prisma.$transaction([prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await bcrypt.hash(parsed.data.password, 12) } }), prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }), prisma.session.deleteMany({ where: { userId: record.userId } })]); return NextResponse.json({ ok: true }); }

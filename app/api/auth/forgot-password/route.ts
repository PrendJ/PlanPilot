import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOpaqueToken, hashToken } from "@/lib/auth";
import { appUrl, sendEmail } from "@/lib/email";
import { clientIp, rateLimit, rejectCrossOrigin } from "@/lib/security";

export async function POST(request: Request) { const originError = rejectCrossOrigin(request); if (originError) return originError; const limited = rateLimit(`reset:${clientIp(request)}`, 5, 60 * 60_000); if (limited) return limited; const parsed = z.object({ email: z.string().email() }).safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ ok: true }); const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } }); if (user) { const token = createOpaqueToken(); await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) } }); await sendEmail({ to: user.email, subject: "Reimposta la password BoardCue", html: `<p>Ciao ${user.name},</p><p><a href="${appUrl()}/reset-password?token=${encodeURIComponent(token)}">Scegli una nuova password</a></p><p>Il link scade tra un'ora.</p>` }); } return NextResponse.json({ ok: true }); }

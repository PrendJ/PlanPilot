import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOpaqueToken, hashToken } from "@/lib/auth";
import { appUrl, escapeHtml, sendEmail } from "@/lib/email";
import { clientIp, rateLimit, rejectCrossOrigin } from "@/lib/security";

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request); if (originError) return originError;
  const limited = rateLimit(`reset:${clientIp(request)}`, 5, 60 * 60_000); if (limited) return limited;
  const parsed = z.object({ email: z.string().email().max(254) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: true });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (user) {
    const token = createOpaqueToken();
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) } }),
    ]);
    const resetUrl = appUrl(`/reset-password?token=${encodeURIComponent(token)}`, request);
    try {
      await sendEmail({ to: user.email, subject: "Reimposta la password BoardCue", html: `<p>Ciao ${escapeHtml(user.name)},</p><p><a href="${escapeHtml(resetUrl)}">Scegli una nuova password</a></p><p>Il link scade tra un’ora. Se non hai richiesto tu la modifica, ignora questa email.</p>` });
    } catch (error) {
      console.error("Password reset email delivery failed", error);
    }
  }
  return NextResponse.json({ ok: true });
}

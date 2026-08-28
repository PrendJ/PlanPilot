import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOpaqueToken, hashToken } from "@/lib/auth";
import { appUrl, escapeHtml, renderEmail, sendEmail } from "@/lib/email";
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
      await sendEmail({
        to: user.email,
        subject: "Reimposta la password BoardCue",
        html: renderEmail({
          title: "Reimposta la password",
          preheader: "Hai richiesto di scegliere una nuova password per BoardCue.",
          paragraphs: [`Ciao ${escapeHtml(user.name)},`, "Abbiamo ricevuto una richiesta per reimpostare la password del tuo account BoardCue."],
          action: { label: "Scegli una nuova password", href: resetUrl },
          note: "Il link è valido per un’ora. Se non hai richiesto tu questa modifica, puoi ignorare questo messaggio.",
        }),
      });
    } catch (error) {
      console.error("Password reset email delivery failed", error);
    }
  }
  return NextResponse.json({ ok: true });
}

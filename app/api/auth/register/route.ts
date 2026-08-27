import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOpaqueToken, hashToken } from "@/lib/auth";
import { createOrganization } from "@/lib/workspace";
import { appUrl, sendEmail } from "@/lib/email";
import { clientIp, rateLimit, rejectCrossOrigin } from "@/lib/security";
import { ensureDefaultOrganization } from "@/lib/default-organization";

const schema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(254), password: z.string().min(10).max(200), organizationName: z.string().trim().min(2).max(100), locale: z.enum(["it", "en", "de", "fr", "es", "ru", "pl"]).default("it") });

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request); if (originError) return originError; const limited = rateLimit(`register:${clientIp(request)}`, 5, 60 * 60_000); if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Controlla i dati inseriti" }, { status: 400 }); const body = parsed.data; const email = body.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return NextResponse.json({ ok: true });
  const token = createOpaqueToken();
  const user = await prisma.$transaction(async (tx) => { const created = await tx.user.create({ data: { name: body.name, email, passwordHash: await bcrypt.hash(body.password, 12), locale: body.locale } }); await tx.verificationToken.create({ data: { userId: created.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } }); return created; });
  await createOrganization({ name: body.organizationName, userId: user.id, locale: body.locale, legalType: "BUSINESS" });
  await ensureDefaultOrganization(user.id);
  await sendEmail({ to: email, subject: "Verifica il tuo account BoardCue", html: `<p>Ciao ${body.name},</p><p>Conferma il tuo indirizzo per attivare BoardCue:</p><p><a href="${appUrl()}/api/auth/verify?token=${encodeURIComponent(token)}">Verifica email</a></p><p>Il link scade tra 24 ore.</p>` });
  return NextResponse.json({ ok: true }, { status: 201 });
}

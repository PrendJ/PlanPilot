import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOrganization } from "@/lib/workspace";
import { clientIp, rateLimit, rejectCrossOrigin } from "@/lib/security";
import { ensureDefaultOrganization } from "@/lib/default-organization";
import { issueExistingAccountEmail, issueVerificationEmail } from "@/lib/verification";

const schema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(254), password: z.string().min(10).max(200), organizationName: z.string().trim().min(2).max(100), locale: z.enum(["it", "en", "de", "fr", "es", "ru", "pl"]).default("it"), next: z.string().max(2048).optional() });

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request); if (originError) return originError; const limited = rateLimit(`register:${clientIp(request)}`, 5, 60 * 60_000); if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Controlla i dati inseriti" }, { status: 400 }); const body = parsed.data; const email = body.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const delivery = existing.emailVerifiedAt ? await issueExistingAccountEmail(existing, request, body.next) : await issueVerificationEmail(existing, request, body.next);
    return NextResponse.json({ ok: true, delivery });
  }
  const user = await prisma.user.create({ data: { name: body.name, email, passwordHash: await bcrypt.hash(body.password, 12), locale: body.locale } });
  await createOrganization({ name: body.organizationName, userId: user.id, locale: body.locale, legalType: "BUSINESS" });
  await ensureDefaultOrganization(user.id);
  const delivery = await issueVerificationEmail(user, request, body.next);
  return NextResponse.json({ ok: true, delivery }, { status: 201 });
}

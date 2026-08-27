import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie } from "@/lib/auth";
import { clientIp, rateLimit, rejectCrossOrigin } from "@/lib/security";
import { z } from "zod";

const schema = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(200) });

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request); if (originError) return originError;
  const limited = rateLimit(`login:${clientIp(request)}`, 10, 15 * 60_000); if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
  const email = parsed.data.email.toLowerCase(); const password = parsed.data.password;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
  }
  if (!user.emailVerifiedAt) return NextResponse.json({ error: "Verifica prima il tuo indirizzo email" }, { status: 403 });
  if (user.lifecycleStatus !== "ACTIVE") return NextResponse.json({ error: "Account sospeso o archiviato" }, { status: 403 });
  const session = await createSession(user.id);
  await setSessionCookie(session.token, session.expiresAt);
  return NextResponse.json({ ok: true });
}

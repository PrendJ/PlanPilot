import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rejectCrossOrigin } from "@/lib/security";
import { issueExistingAccountEmail, issueVerificationEmail } from "@/lib/verification";

const schema = z.object({ email: z.string().email().max(254), next: z.string().max(2048).optional() });

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request); if (originError) return originError;
  const limited = rateLimit(`verify-resend:${clientIp(request)}`, 5, 60 * 60_000); if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: true });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const delivery = user ? (user.emailVerifiedAt ? await issueExistingAccountEmail(user, request, parsed.data.next) : await issueVerificationEmail(user, request, parsed.data.next)) : "sent";
  return NextResponse.json({ ok: true, delivery });
}

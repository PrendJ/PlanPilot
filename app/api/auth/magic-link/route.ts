import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rejectCrossOrigin } from "@/lib/security";
import { issueMagicLinkEmail } from "@/lib/verification";
import { apiError } from "@/lib/errors";

/** Passwordless sign-in. The response is identical whether or not the address exists. */
export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const limited = await rateLimit(`magic:${clientIp(request)}`, 5, 60 * 60_000, request);
  if (limited) return limited;
  const parsed = z
    .object({ email: z.string().email().max(254), next: z.string().max(2048).optional() })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true, email: true, name: true, lifecycleStatus: true },
  });
  if (user?.lifecycleStatus === "ACTIVE") await issueMagicLinkEmail(user, request, parsed.data.next);
  return NextResponse.json({ ok: true });
}

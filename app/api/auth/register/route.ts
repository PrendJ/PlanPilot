import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOrganization } from "@/lib/workspace";
import { clientIp, rateLimit, rejectCrossOrigin } from "@/lib/security";
import { ensureDefaultOrganization } from "@/lib/default-organization";
import { issueExistingAccountEmail, issueVerificationEmail } from "@/lib/verification";
import { startSession } from "@/lib/auth";
import { createStarterBoard } from "@/lib/onboarding";
import { safeNextPath } from "@/lib/navigation";
import { apiError } from "@/lib/errors";
import { trackEvent } from "@/lib/product-events";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().max(254),
  password: z.string().min(10).max(200),
  locale: z.enum(["it", "en", "de", "fr", "es", "ru", "pl"]).default("it"),
  next: z.string().max(2048).optional(),
  ref: z.string().trim().max(40).optional(),
});

function referralCode() {
  return randomBytes(5).toString("base64url").replace(/[-_]/g, "x").slice(0, 8).toUpperCase();
}

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const limited = await rateLimit(`register:${clientIp(request)}`, 5, 60 * 60_000, request);
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const body = parsed.data;
  const email = body.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Same response as a new account: registration never reveals whether an address is known.
    const delivery = existing.emailVerifiedAt
      ? await issueExistingAccountEmail(existing, request, body.next)
      : await issueVerificationEmail(existing, request, body.next);
    return NextResponse.json({ ok: true, delivery, session: false });
  }
  const referrer = body.ref
    ? await prisma.user.findUnique({ where: { referralCode: body.ref.toUpperCase() }, select: { id: true } })
    : null;
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email,
      passwordHash: await bcrypt.hash(body.password, 12),
      locale: body.locale,
      referralCode: referralCode(),
      referredById: referrer?.id,
    },
  });
  const teamName = body.locale === "it" ? `Team di ${body.name}` : `${body.name}'s team`;
  const organization = await createOrganization({ name: teamName, userId: user.id, locale: body.locale, legalType: "BUSINESS" });
  await ensureDefaultOrganization(user.id);
  const next = safeNextPath(body.next, "");
  // People joining through an invite land on the invited board: no sample board for them.
  const board = next.startsWith("/accept-invite")
    ? null
    : await createStarterBoard({ userId: user.id, organizationId: organization.id, locale: body.locale });
  const delivery = await issueVerificationEmail(user, request, body.next);
  await startSession(user.id);
  await trackEvent("signup");
  return NextResponse.json(
    { ok: true, delivery, session: true, destination: next || (board ? `/app/${board.slug}?welcome=1` : "/app") },
    { status: 201 },
  );
}

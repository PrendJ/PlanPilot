import { NextResponse } from "next/server";
import { hashToken, clearSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/email";
import { claimEmailIdentity, lockIdentity } from "@/lib/identity";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const invalid = () => NextResponse.redirect(appUrl("/login?verified=invalid", request));
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return invalid();
  const record = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record) return invalid();
  const result = await prisma.$transaction(async tx => {
    await lockIdentity(tx, record.userId);
    const claimed = await tx.verificationToken.deleteMany({ where: { id: record.id, expiresAt: { gt: new Date() } } });
    if (!claimed.count) return null;
    return { setup: await claimEmailIdentity(tx, record.userId) };
  });
  if (!result) return invalid();
  await clearSession();
  return NextResponse.redirect(appUrl(result.setup ? `/reset-password?token=${encodeURIComponent(result.setup)}&verified=1` : "/login?verified=1", request));
}

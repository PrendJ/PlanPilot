import { NextResponse } from "next/server";
import { CredentialsChangedError, hashToken, startSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/email";
import { safeNextPath } from "@/lib/navigation";
import { beginTwoFactor } from "@/lib/two-factor";
import { ensureDefaultOrganization } from "@/lib/default-organization";
import { claimEmailIdentity, lockIdentity } from "@/lib/identity";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const next = safeNextPath(url.searchParams.get("next"), "/app");
  const login = (query: Record<string, string>) =>
    NextResponse.redirect(appUrl(`/login?${new URLSearchParams({ ...query, ...(next !== "/app" && { next }) })}`, request));
  if (!token) return login({ magic: "invalid" });
  // Single use: the token is claimed atomically before anything else happens.
  const record = await prisma.loginToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date() || record.user.lifecycleStatus !== "ACTIVE")
    return login({ magic: "invalid" });
  const result = await prisma.$transaction(async tx => {
    await lockIdentity(tx, record.userId);
    const claimed = await tx.loginToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (!claimed.count) return null;
    return { setup: await claimEmailIdentity(tx, record.userId) };
  });
  if (!result) return login({ magic: "invalid" });
  if (result.setup) return NextResponse.redirect(appUrl(`/reset-password?token=${encodeURIComponent(result.setup)}&verified=1`, request));
  await ensureDefaultOrganization(record.userId);
  try {
  if (record.user.totpEnabledAt) {
    await beginTwoFactor(record.userId, record.user.passwordHash);
    return login({ twofactor: "1" });
  }
  await startSession(record.userId, record.user);
  return NextResponse.redirect(appUrl(next, request));
  } catch (error) { if (error instanceof CredentialsChangedError) return login({ magic: "invalid" }); throw error; }
}

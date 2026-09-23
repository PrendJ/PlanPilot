import { NextResponse } from "next/server";
import { hashToken, startSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/email";
import { safeNextPath } from "@/lib/navigation";
import { beginTwoFactor } from "@/lib/two-factor";
import { ensureDefaultOrganization } from "@/lib/default-organization";

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
  const claimed = await prisma.loginToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!claimed.count) return login({ magic: "invalid" });
  // Opening the link proves control of the mailbox.
  if (!record.user.emailVerifiedAt) await prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  await ensureDefaultOrganization(record.userId);
  if (record.user.totpEnabledAt) {
    await beginTwoFactor(record.userId);
    return login({ twofactor: "1" });
  }
  await startSession(record.userId);
  return NextResponse.redirect(appUrl(next, request));
}

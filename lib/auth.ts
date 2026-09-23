import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE = "boardcue_session";
const LEGACY_COOKIE = "voxboard_session";
export const TWO_FACTOR_COOKIE = "boardcue_2fa";
const SESSION_DAYS = 30;
export const UNVERIFIED_GRACE_DAYS = 7;

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createSession(userId: string) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return { token, expiresAt };
}

const cookieBase = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" });

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(COOKIE, token, { ...cookieBase(), expires: expiresAt });
}

export async function startSession(userId: string) {
  const session = await createSession(userId);
  await setSessionCookie(session.token, session.expiresAt);
  return session;
}

export async function clearSession(allForUser = false) {
  const jar = await cookies();
  const tokens = [jar.get(COOKIE)?.value, jar.get(LEGACY_COOKIE)?.value].filter(Boolean) as string[];
  if (tokens.length) {
    const hashes = tokens.map(hashToken);
    if (allForUser) {
      const session = await prisma.session.findFirst({ where: { tokenHash: { in: hashes } }, select: { userId: true } });
      if (session) await prisma.session.deleteMany({ where: { userId: session.userId } });
    } else await prisma.session.deleteMany({ where: { tokenHash: { in: hashes } } });
  }
  jar.set(COOKIE, "", { ...cookieBase(), expires: new Date(0) });
  jar.set(LEGACY_COOKIE, "", { ...cookieBase(), expires: new Date(0) });
}

/**
 * Sessions are valid for unverified accounts too: people can try the product immediately.
 * Inviting others, billing and deleting teams still require a verified address (see requireVerified).
 */
export async function getCurrentSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value || jar.get(LEGACY_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || session.user.lifecycleStatus !== "ACTIVE") {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session;
}

export async function getCurrentUser() {
  return (await getCurrentSession())?.user ?? null;
}

export function isVerified(user: { emailVerifiedAt: Date | null }) {
  return Boolean(user.emailVerifiedAt);
}

/** Organizations requiring two-step verification that this user has not satisfied yet. */
export async function twoFactorRequiredButMissing(user: { id: string; totpEnabledAt: Date | null }) {
  if (user.totpEnabledAt) return false;
  return Boolean(
    await prisma.organizationMember.findFirst({
      where: { userId: user.id, organization: { require2fa: true, lifecycleStatus: "ACTIVE" } },
      select: { id: true },
    }),
  );
}

/** Personal API tokens: "Authorization: Bearer bc_…". */
export async function userFromApiToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(bc_[A-Za-z0-9_-]{20,})$/);
  if (!match) return null;
  const token = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(match[1]) }, include: { user: true } });
  if (!token || token.revokedAt || token.user.lifecycleStatus !== "ACTIVE" || !token.user.emailVerifiedAt) return null;
  if (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 60_000)
    await prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return token.user;
}

export function newApiToken() {
  const token = `bc_${crypto.randomBytes(24).toString("base64url")}`;
  return { token, prefix: token.slice(0, 7), tokenHash: hashToken(token) };
}

export async function getWorkspaceAccess(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: { include: { organization: true } } },
  });
}

export async function canAccessWorkspace(userId: string, workspaceId: string) {
  return getWorkspaceAccess(userId, workspaceId);
}

export async function canManageWorkspace(userId: string, workspaceId: string, _globalAdmin = false) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return membership?.role === "OWNER" || membership?.role === "ADMIN";
}

export async function getOrganizationAccess(userId: string, organizationId: string) {
  return prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  });
}

export async function canManageOrganization(userId: string, organizationId: string, _globalAdmin = false) {
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  return membership?.role === "OWNER" || membership?.role === "ADMIN";
}

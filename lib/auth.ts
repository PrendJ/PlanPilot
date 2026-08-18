import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE = "boardcue_session";
const LEGACY_COOKIE = "voxboard_session";
const SESSION_DAYS = 30;

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

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
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
  jar.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", expires: new Date(0), path: "/" });
  jar.set(LEGACY_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", expires: new Date(0), path: "/" });
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value || jar.get(LEGACY_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
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

export async function canManageWorkspace(userId: string, workspaceId: string, globalAdmin = false) {
  if (globalAdmin) return true;
  const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
  return membership?.role === "OWNER" || membership?.role === "ADMIN";
}

export async function getOrganizationAccess(userId: string, organizationId: string) {
  return prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } }, include: { organization: true } });
}

export async function canManageOrganization(userId: string, organizationId: string, globalAdmin = false) {
  if (globalAdmin) return true;
  const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } }, select: { role: true } });
  return membership?.role === "OWNER" || membership?.role === "ADMIN";
}

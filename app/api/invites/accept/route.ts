import { canManageSpaces, canUseSpaces, syncSpace } from "@/lib/spaces";
import { safeJson } from "@/lib/security";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser, hashToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";
import { getOrganizationLimits, organizationReadOnly } from "@/lib/plans";

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const user = await getApiUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  // Invitors also know the invitation token: it is not independent mailbox proof.
  if (!user.emailVerifiedAt) return apiError(request, "EMAIL_NOT_VERIFIED", 403);
  const parsed = z.object({ token: z.string().min(20) }).safeParse(await safeJson(request));
  if (!parsed.success) return apiError(request, "INVITE_INVALID", 400);
  const invite = await prisma.workspaceInvite.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    include: { workspace: { select: { slug: true } } },
  });
  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date()) return apiError(request, "INVITE_INVALID", 400);
  if (invite.email !== user.email.toLowerCase()) return apiError(request, "INVITE_WRONG_EMAIL", 403, undefined, { email: user.email });
  const guest = invite.role === "GUEST";
  try {
    await prisma.$transaction(async tx => {
      // Seats are re-checked at acceptance under a lock: several pending invites cannot overfill the plan.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seats:${invite.organizationId}`}))`;
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${invite.organizationId} FOR SHARE`;
      const organization = await tx.organization.findUniqueOrThrow({ where: { id: invite.organizationId } });
      if (organizationReadOnly(organization)) throw new Error("INVITE_INVALID");
      if (invite.workspaceId && !(await tx.workspace.findFirst({ where: { id: invite.workspaceId, lifecycleStatus: "ACTIVE" } }))) throw new Error("INVITE_INVALID");
      if (invite.spaceId && (!canUseSpaces(organization.plan) || !await tx.space.findFirst({ where: { id: invite.spaceId, organizationId: invite.organizationId } }))) throw new Error("INVITE_INVALID");
      if (invite.spaceId) {
        const inviter = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: invite.organizationId, userId: invite.invitedById } }, include: { user: true } });
        if (!inviter || !canManageSpaces(inviter.role) || inviter.user.lifecycleStatus !== "ACTIVE") throw new Error("INVITE_INVALID");
      }
      const claimed = await tx.workspaceInvite.updateMany({ where: { id: invite.id, tokenHash: hashToken(parsed.data.token), acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
      if (!claimed.count) throw new Error("INVITE_INVALID");
      const existing = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: invite.organizationId, userId: user.id } },
      });
      const needsSeat = !guest && (!existing || existing.role === "GUEST");
      if (needsSeat) {
        const used = await tx.organizationMember.count({ where: { organizationId: invite.organizationId, role: { not: "GUEST" } } });
        if (used >= getOrganizationLimits(organization).memberLimit) throw new Error("MEMBER_LIMIT");
      }
      if (!existing)
        await tx.organizationMember.create({
          data: { organizationId: invite.organizationId, userId: user.id, role: guest ? "GUEST" : "MEMBER" },
        });
      else if (existing.role === "GUEST" && !guest)
        await tx.organizationMember.update({ where: { id: existing.id }, data: { role: "MEMBER" } });
      if (invite.spaceId) {
        await tx.spaceMember.upsert({ where: { spaceId_userId: { spaceId: invite.spaceId, userId: user.id } }, create: { spaceId: invite.spaceId, userId: user.id, role: invite.role }, update: {} });
        await syncSpace(tx, invite.spaceId);
        await tx.user.update({ where: { id: user.id }, data: { activeOrganizationId: invite.organizationId } });
      }
      if (invite.workspaceId) {
        const boardMember = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } } });
        await tx.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
          create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role },
          // An old invite must never demote an existing owner/member.
          update: boardMember?.inheritedFromSpaceId ? { inheritedFromSpaceId: null, role: invite.role } : {},
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MEMBER_LIMIT") return apiError(request, "MEMBER_LIMIT", 402);
    if (error instanceof Error && error.message === "INVITE_INVALID") return apiError(request, "INVITE_INVALID", 400);
    throw error;
  }
  return NextResponse.json({ ok: true, destination: invite.workspace ? `/app/${invite.workspace.slug}` : "/app" });
}

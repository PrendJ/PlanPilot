import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, hashToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";
import { getOrganizationLimits } from "@/lib/plans";

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const parsed = z.object({ token: z.string().min(20) }).safeParse(await request.json().catch(() => ({})));
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
      const organization = await tx.organization.findUniqueOrThrow({ where: { id: invite.organizationId } });
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
      if (invite.workspaceId)
        await tx.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
          create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role },
          update: { role: invite.role },
        });
      await tx.workspaceInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      // The token was delivered to this mailbox: that proves the address.
      if (!user.emailVerifiedAt) await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MEMBER_LIMIT") return apiError(request, "MEMBER_LIMIT", 402);
    throw error;
  }
  return NextResponse.json({ ok: true, destination: invite.workspace ? `/app/${invite.workspace.slug}` : "/app" });
}

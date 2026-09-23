import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isVerified } from "@/lib/auth";
import { rateLimit } from "@/lib/security";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { INVITE_ROLES, newInviteToken, seatAvailable, sendInviteEmail } from "@/lib/invites";
import { getOrganizationLimits } from "@/lib/plans";
import { markMilestone } from "@/lib/board";
import { trackEvent } from "@/lib/product-events";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  const invites = await prisma.workspaceInvite.findMany({
    where: { workspaceId: ctx.workspace.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, invitedBy: { select: { name: true } } },
  });
  return NextResponse.json({ invites });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  if (!isVerified(ctx.user)) return apiError(request, "EMAIL_NOT_VERIFIED", 403);
  const limited = await rateLimit(`invite:${ctx.user.id}`, 30, 60 * 60_000, request);
  if (limited) return limited;
  const parsed = z
    .object({ email: z.string().email().max(254), role: z.enum(INVITE_ROLES).default("MEMBER") })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const { workspace, user } = ctx;
  const email = parsed.data.email.toLowerCase();
  if (parsed.data.role === "GUEST" && !getOrganizationLimits(workspace.organization).guests) return apiError(request, "FORBIDDEN", 403);
  if (parsed.data.role !== "GUEST") {
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!(await seatAvailable(workspace.organization, existingUser?.id))) return apiError(request, "MEMBER_LIMIT", 402);
  }
  await prisma.workspaceInvite.updateMany({
    where: { workspaceId: workspace.id, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const { token, tokenHash, expiresAt } = newInviteToken();
  const invite = await prisma.workspaceInvite.create({
    data: {
      organizationId: workspace.organizationId,
      workspaceId: workspace.id,
      invitedById: user.id,
      email,
      role: parsed.data.role,
      tokenHash,
      expiresAt,
    },
  });
  const inviteUrl = await sendInviteEmail({
    request,
    email,
    token,
    inviterName: user.name,
    workspaceName: workspace.name,
    role: parsed.data.role,
  }).catch(() => null);
  await markMilestone(prisma, workspace.organizationId, "firstInviteAt");
  await trackEvent("invite_sent");
  return NextResponse.json(
    {
      invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt, createdAt: invite.createdAt },
      inviteUrl,
      emailed: Boolean(inviteUrl),
    },
    { status: 201 },
  );
}

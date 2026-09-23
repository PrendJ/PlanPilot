import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { newInviteToken, sendInviteEmail } from "@/lib/invites";

/** Resend: issues a fresh link (the old one stops working) and returns it so it can also be copied. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; inviteId: string }> }) {
  const { slug, inviteId } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  const invite = await prisma.workspaceInvite.findFirst({
    where: { id: inviteId, workspaceId: ctx.workspace.id, acceptedAt: null, revokedAt: null },
  });
  if (!invite) return apiError(request, "NOT_FOUND", 404);
  const { token, tokenHash, expiresAt } = newInviteToken();
  await prisma.workspaceInvite.update({ where: { id: invite.id }, data: { tokenHash, expiresAt } });
  const inviteUrl = await sendInviteEmail({
    request,
    email: invite.email,
    token,
    inviterName: ctx.user.name,
    workspaceName: ctx.workspace.name,
    role: invite.role,
  }).catch(() => null);
  return NextResponse.json({ ok: true, inviteUrl, expiresAt, emailed: Boolean(inviteUrl) });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; inviteId: string }> }) {
  const { slug, inviteId } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  const revoked = await prisma.workspaceInvite.updateMany({
    where: { id: inviteId, workspaceId: ctx.workspace.id, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!revoked.count) return apiError(request, "NOT_FOUND", 404);
  return NextResponse.json({ ok: true });
}

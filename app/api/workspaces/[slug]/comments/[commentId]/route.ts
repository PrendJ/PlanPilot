import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bumpRevision, canManageRole } from "@/lib/board";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";

async function load(request: Request, slug: string, commentId: string) {
  const ctx = await boardContext(request, slug, { comment: true });
  if (isResponse(ctx)) return ctx;
  const comment = await prisma.cardComment.findFirst({ where: { id: commentId, workspaceId: ctx.workspace.id, deletedAt: null } });
  if (!comment) return apiError(request, "NOT_FOUND", 404);
  return { ctx, comment };
}

/** Authors edit their own comments. */
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; commentId: string }> }) {
  const { slug, commentId } = await params;
  const loaded = await load(request, slug, commentId);
  if (isResponse(loaded)) return loaded;
  if (loaded.comment.userId !== loaded.ctx.user.id) return apiError(request, "FORBIDDEN", 403);
  const parsed = z.object({ body: z.string().trim().min(1).max(5000) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const comment = await prisma.cardComment.update({
    where: { id: commentId },
    data: { body: parsed.data.body, editedAt: new Date() },
    select: { id: true, body: true, editedAt: true },
  });
  await prisma.$transaction(async tx => {
    await bumpRevision(tx, loaded.ctx.workspace.id);
  });
  return NextResponse.json({ comment });
}

/** Authors and board managers can remove a comment (soft delete). */
export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; commentId: string }> }) {
  const { slug, commentId } = await params;
  const loaded = await load(request, slug, commentId);
  if (isResponse(loaded)) return loaded;
  if (loaded.comment.userId !== loaded.ctx.user.id && !canManageRole(loaded.ctx.role)) return apiError(request, "FORBIDDEN", 403);
  await prisma.cardComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
  await prisma.$transaction(async tx => {
    await bumpRevision(tx, loaded.ctx.workspace.id);
  });
  return NextResponse.json({ ok: true });
}

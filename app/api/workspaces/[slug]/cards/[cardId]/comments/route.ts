import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertBoardAccess, BoardAccessError, bumpRevision, isBoardConflict, logActivity } from "@/lib/board";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { notify } from "@/lib/notifications";

const commentSelect = {
  id: true,
  body: true,
  mentions: true,
  createdAt: true,
  editedAt: true,
  user: { select: { id: true, name: true } },
} as const;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; cardId: string }> }) {
  const { slug, cardId } = await params;
  const ctx = await boardContext(request, slug);
  if (isResponse(ctx)) return ctx;
  const comments = await prisma.cardComment.findMany({
    where: { cardId, workspaceId: ctx.workspace.id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: commentSelect,
  });
  return NextResponse.json({ comments });
}

/** Guests can comment too: it is the main way clients take part in a board. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; cardId: string }> }) {
  const { slug, cardId } = await params;
  const ctx = await boardContext(request, slug, { comment: true });
  if (isResponse(ctx)) return ctx;
  const parsed = z
    .object({ body: z.string().trim().min(1).max(5000), mentions: z.array(z.string().cuid()).max(20).default([]) })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const { workspace, user } = ctx;
  const card = await prisma.card.findFirst({
    where: { id: cardId, workspaceId: workspace.id },
    select: { id: true, title: true, assignees: { select: { userId: true } } },
  });
  if (!card) return apiError(request, "NOT_FOUND", 404);
  const mentioned = (
    await prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id, userId: { in: parsed.data.mentions } },
      select: { userId: true },
    })
  ).map(member => member.userId);
  try {
    const comment = await prisma.$transaction(async tx => {
      if ((await assertBoardAccess(workspace.id, tx, { userId: user.id, allowGuest: true })) === null) throw new BoardAccessError();
      const created = await tx.cardComment.create({
        data: { cardId, workspaceId: workspace.id, userId: user.id, body: parsed.data.body, mentions: mentioned },
        select: commentSelect,
      });
      await logActivity(tx, {
        organizationId: workspace.organizationId,
        workspaceId: workspace.id,
        userId: user.id,
        type: "COMMENT_CREATED",
        entityType: "CARD",
        entityId: cardId,
        afterState: { title: card.title, commentId: created.id },
      });
      const payload = {
        cardTitle: card.title,
        boardName: workspace.name,
        boardSlug: workspace.slug,
        excerpt: parsed.data.body.slice(0, 140),
      };
      await notify(tx, { userIds: mentioned, type: "MENTIONED", workspaceId: workspace.id, cardId, actorId: user.id, payload });
      const previous = await tx.cardComment.findMany({
        where: { cardId, deletedAt: null },
        select: { userId: true },
        distinct: ["userId"],
      });
      const followers = [...card.assignees.map(item => item.userId), ...previous.map(item => item.userId)].filter(
        id => !mentioned.includes(id),
      );
      await notify(tx, { userIds: followers, type: "COMMENTED", workspaceId: workspace.id, cardId, actorId: user.id, payload });
      await bumpRevision(tx, workspace.id);
      return created;
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    if (isBoardConflict(error)) return apiError(request, "FORBIDDEN", 403);
    throw error;
  }
}

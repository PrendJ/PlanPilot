import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertBoardAccess,
  BoardAccessError,
  bumpRevision,
  CardConflictError,
  cardInclude,
  claimCardVersion,
  isBoardConflict,
  logActivity,
  markMilestone,
  placeCard,
} from "@/lib/board";
import { boardContext, isResponse } from "@/lib/api-context";
import { cardPatchSchema } from "@/lib/card-schema";
import { apiError } from "@/lib/errors";
import { notify } from "@/lib/notifications";

function serialize<T extends { _count: { comments: number } }>(card: T) {
  const { _count, ...rest } = card;
  return { ...rest, commentCount: _count.comments };
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; cardId: string }> }) {
  const { slug, cardId } = await params;
  const ctx = await boardContext(request, slug);
  if (isResponse(ctx)) return ctx;
  const card = await prisma.card.findFirst({ where: { id: cardId, workspaceId: ctx.workspace.id }, include: cardInclude });
  if (!card) return apiError(request, "NOT_FOUND", 404);
  const activity = await prisma.activityEvent.findMany({
    where: { workspaceId: ctx.workspace.id, entityId: cardId },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { user: { select: { id: true, name: true } } },
  });
  return NextResponse.json({
    card: serialize(card),
    activity: activity.map(event => ({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt,
      user: event.user,
      undoneAt: event.undoneAt,
    })),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; cardId: string }> }) {
  const { slug, cardId } = await params;
  const ctx = await boardContext(request, slug, { write: true });
  if (isResponse(ctx)) return ctx;
  const { workspace, user } = ctx;
  const parsed = cardPatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400, { details: parsed.error.flatten() });
  const body = parsed.data;
  const before = await prisma.card.findFirst({ where: { id: cardId, workspaceId: workspace.id }, include: { assignees: true } });
  if (!before) return apiError(request, "NOT_FOUND", 404);
  if (
    body.columnId &&
    !(await prisma.boardColumn.findFirst({ where: { id: body.columnId, workspaceId: workspace.id }, select: { id: true } }))
  )
    return apiError(request, "INVALID_INPUT", 400);
  const assigneeIds = body.assigneeIds ? [...new Set(body.assigneeIds)] : null;
  if (
    assigneeIds &&
    (await prisma.workspaceMember.count({ where: { workspaceId: workspace.id, userId: { in: assigneeIds }, role: { not: "GUEST" } } })) !==
      assigneeIds.length
  )
    return apiError(request, "INVALID_INPUT", 400);
  const columnChanged = Boolean(body.columnId && body.columnId !== before.columnId);
  const onlyMove = Object.keys(body).every(key => ["version", "columnId", "index"].includes(key));
  try {
    const result = await prisma.$transaction(async tx => {
      if ((await assertBoardAccess(workspace.id, tx, { userId: user.id })) === null) throw new BoardAccessError();
      // Moving a card does not conflict with someone editing its text: only field edits carry the version check.
      await claimCardVersion(tx, workspace.id, cardId, onlyMove ? undefined : body.version);
      const data = {
        ...(body.columnId && { columnId: body.columnId }),
        ...(body.title && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.priority && { priority: body.priority }),
        ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null, dueReminderSentAt: null }),
        ...(body.tags && { tags: body.tags }),
        ...(body.checklist && { checklist: body.checklist }),
        ...(body.archived !== undefined && { archived: body.archived }),
        // claimCardVersion already bumped the version when it checked it.
        ...((onlyMove || body.version === undefined) && { version: { increment: 1 } }),
      };
      await tx.card.update({ where: { id: cardId }, data });
      if (assigneeIds) {
        await tx.cardAssignee.deleteMany({ where: { cardId } });
        if (assigneeIds.length) await tx.cardAssignee.createMany({ data: assigneeIds.map(userId => ({ cardId, userId })) });
        const added = assigneeIds.filter(id => !before.assignees.some(existing => existing.userId === id));
        await notify(tx, {
          userIds: added,
          type: "ASSIGNED",
          workspaceId: workspace.id,
          cardId,
          actorId: user.id,
          payload: { cardTitle: body.title || before.title, boardName: workspace.name, boardSlug: workspace.slug },
        });
      }
      if (body.columnId || body.index !== undefined)
        await placeCard(tx, workspace.id, body.columnId || before.columnId, cardId, body.index);
      if (body.archived === false) await placeCard(tx, workspace.id, body.columnId || before.columnId, cardId, 0);
      const card = await tx.card.findUniqueOrThrow({ where: { id: cardId }, include: cardInclude });
      const type =
        body.archived === true
          ? "CARD_ARCHIVED"
          : body.archived === false
            ? "CARD_RESTORED"
            : onlyMove && columnChanged
              ? "CARD_MOVED"
              : onlyMove
                ? "CARD_REORDERED"
                : "CARD_UPDATED";
      if (type !== "CARD_REORDERED")
        await logActivity(tx, {
          organizationId: workspace.organizationId,
          workspaceId: workspace.id,
          userId: user.id,
          type,
          entityType: "CARD",
          entityId: cardId,
          beforeState: { title: before.title, columnId: before.columnId, version: before.version },
          afterState: { title: card.title, columnId: card.columnId, version: card.version, ...(columnChanged && { columnChanged: true }) },
        });
      if (columnChanged) await markMilestone(tx, workspace.organizationId, "firstCardMovedAt");
      const revision = (await bumpRevision(tx, workspace.id)).revision;
      return { card: serialize(card), revision };
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CardConflictError) {
      const current = await prisma.card.findFirst({ where: { id: cardId, workspaceId: workspace.id }, include: cardInclude });
      return apiError(request, "CARD_CONFLICT", 409, { card: current ? serialize(current) : null });
    }
    if (isBoardConflict(error)) return apiError(request, "BOARD_CONFLICT", 409);
    throw error;
  }
}

/** Archive (reversible). Kept for older clients: equivalent to PATCH { archived: true }. */
export async function DELETE(request: Request, context: { params: Promise<{ slug: string; cardId: string }> }) {
  return PATCH(new Request(request.url, { method: "PATCH", headers: request.headers, body: JSON.stringify({ archived: true }) }), context);
}

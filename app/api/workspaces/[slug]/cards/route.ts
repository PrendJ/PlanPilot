import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertBoardAccess, BoardAccessError, bumpRevision, cardInclude, isBoardConflict, logActivity, placeCard } from "@/lib/board";
import { boardContext, isResponse } from "@/lib/api-context";
import { cardCreateSchema } from "@/lib/card-schema";
import { apiError } from "@/lib/errors";
import { notify } from "@/lib/notifications";
import { trackEvent } from "@/lib/product-events";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug, { write: true });
  if (isResponse(ctx)) return ctx;
  const parsed = cardCreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400, { details: parsed.error.flatten() });
  const body = parsed.data;
  const { workspace, user } = ctx;
  if (!(await prisma.boardColumn.findFirst({ where: { id: body.columnId, workspaceId: workspace.id }, select: { id: true } })))
    return apiError(request, "INVALID_INPUT", 400);
  const assigneeIds = [...new Set(body.assigneeIds)];
  if (
    (await prisma.workspaceMember.count({ where: { workspaceId: workspace.id, userId: { in: assigneeIds }, role: { not: "GUEST" } } })) !==
    assigneeIds.length
  )
    return apiError(request, "INVALID_INPUT", 400);
  try {
    const result = await prisma.$transaction(async tx => {
      if ((await assertBoardAccess(workspace.id, tx, { userId: user.id })) === null) throw new BoardAccessError();
      const created = await tx.card.create({
        data: {
          workspaceId: workspace.id,
          columnId: body.columnId,
          title: body.title,
          description: body.description,
          priority: body.priority,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          tags: body.tags,
          checklist: body.checklist,
          position: 100000,
          assignees: { create: assigneeIds.map(userId => ({ userId })) },
        },
      });
      await placeCard(tx, workspace.id, body.columnId, created.id, body.index ?? 0);
      const card = await tx.card.findUniqueOrThrow({ where: { id: created.id }, include: cardInclude });
      await logActivity(tx, {
        organizationId: workspace.organizationId,
        workspaceId: workspace.id,
        userId: user.id,
        type: "CARD_CREATED",
        entityType: "CARD",
        entityId: card.id,
        afterState: { title: card.title, columnId: card.columnId },
      });
      await notify(tx, {
        userIds: assigneeIds,
        type: "ASSIGNED",
        workspaceId: workspace.id,
        cardId: card.id,
        actorId: user.id,
        payload: { cardTitle: card.title, boardName: workspace.name, boardSlug: workspace.slug },
      });
      const revision = (await bumpRevision(tx, workspace.id)).revision;
      const { _count, ...rest } = card;
      return { card: { ...rest, commentCount: _count.comments }, revision };
    });
    await trackEvent("card_created");
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (isBoardConflict(error)) return apiError(request, "BOARD_CONFLICT", 409);
    throw error;
  }
}

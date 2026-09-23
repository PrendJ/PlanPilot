import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertBoardAccess, BoardAccessError, bumpRevision, isBoardConflict, logActivity, unchangedSince } from "@/lib/board";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { trackEvent } from "@/lib/product-events";

type CardState = Record<string, unknown>;

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; updateId: string }> }) {
  const { slug, updateId } = await params;
  const ctx = await boardContext(request, slug, { write: true });
  if (isResponse(ctx)) return ctx;
  const { workspace, user } = ctx;
  try {
    const revision = await prisma.$transaction(async tx => {
      if ((await assertBoardAccess(workspace.id, tx, { userId: user.id })) === null) throw new BoardAccessError();
      const log = await tx.updateLog.findFirst({ where: { id: updateId, workspaceId: workspace.id, undoneAt: null } });
      const state = log?.beforeState as { batchId?: string } | null;
      if (!log || !state?.batchId) throw new Error("NOT_UNDOABLE");
      const events = await tx.activityEvent.findMany({
        where: {
          batchId: state.batchId,
          workspaceId: workspace.id,
          organizationId: workspace.organizationId,
          undoable: true,
          undoneAt: null,
        },
        orderBy: { createdAt: "desc" },
      });
      if (
        !Array.isArray(log.actions) ||
        events.length !== log.actions.length ||
        new Set(events.map(event => event.entityId)).size !== events.length
      )
        throw new Error("UNDO_CONFLICT");
      for (const event of events) {
        const before = event.beforeState as CardState | null;
        const after = event.afterState as CardState | null;
        if (!event.entityId || !after || !["AI_CARD_CREATED", "AI_CARD_UPDATED", "AI_CARD_ARCHIVED"].includes(event.type))
          throw new Error("UNDO_CONFLICT");
        const current = await tx.card.findFirst({
          where: { id: event.entityId, workspaceId: workspace.id },
          include: { assignees: true, _count: { select: { comments: true } } },
        });
        if (!current || !unchangedSince(current, after)) throw new Error("UNDO_CONFLICT");
        if (event.type === "AI_CARD_CREATED") {
          // Never discard work people added afterwards.
          if (current.assignees.length || current._count.comments) throw new Error("UNDO_CONFLICT");
          await tx.card.deleteMany({ where: { id: event.entityId, workspaceId: workspace.id } });
        } else {
          if (
            !before ||
            !(await tx.boardColumn.findFirst({ where: { id: String(before.columnId), workspaceId: workspace.id }, select: { id: true } }))
          )
            throw new Error("UNDO_CONFLICT");
          await tx.card.update({
            where: { id: event.entityId, workspaceId: workspace.id },
            data: {
              columnId: String(before.columnId),
              title: String(before.title),
              description: String(before.description || ""),
              priority: String(before.priority || "NORMAL"),
              dueDate: before.dueDate ? new Date(String(before.dueDate)) : null,
              tags: (before.tags || []) as never,
              position: Number(before.position || 0),
              archived: Boolean(before.archived),
              version: { increment: 1 },
            },
          });
        }
        await tx.activityEvent.update({ where: { id: event.id }, data: { undoneAt: new Date() } });
      }
      await tx.updateLog.update({ where: { id: log.id }, data: { undoneAt: new Date() } });
      await logActivity(tx, {
        organizationId: workspace.organizationId,
        workspaceId: workspace.id,
        userId: user.id,
        type: "AI_UPDATE_UNDONE",
        entityType: "UPDATE",
        entityId: log.id,
        batchId: state.batchId,
        afterState: { summary: log.summary },
      });
      return (await bumpRevision(tx, workspace.id)).revision;
    });
    await trackEvent("ai_update_undone");
    return NextResponse.json({ revision });
  } catch (error) {
    if (isBoardConflict(error)) return apiError(request, "BOARD_CONFLICT", 409);
    if (error instanceof Error && error.message === "NOT_UNDOABLE") return apiError(request, "NOT_UNDOABLE", 400);
    if (error instanceof Error && error.message === "UNDO_CONFLICT") return apiError(request, "UNDO_CONFLICT", 409);
    throw error;
  }
}

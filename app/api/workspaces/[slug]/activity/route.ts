import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { boardContext, isResponse } from "@/lib/api-context";

type State = Record<string, unknown> | null;

/**
 * Activity feed: who did what, when. AI updates carry the list of card changes (also used as the
 * undo preview: undoing reverts exactly these changes). Manual changes appear as single events.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug);
  if (isResponse(ctx)) return ctx;
  const filter = new URL(request.url).searchParams.get("filter") || "all";
  const workspaceId = ctx.workspace.id;
  const [columns, logs, events] = await Promise.all([
    prisma.boardColumn.findMany({ where: { workspaceId }, select: { id: true, title: true } }),
    filter === "manual"
      ? Promise.resolve([])
      : prisma.updateLog.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { user: { select: { id: true, name: true } } },
        }),
    filter === "ai"
      ? Promise.resolve([])
      : prisma.activityEvent.findMany({
          where: {
            workspaceId,
            batchId: null,
            type: {
              in: [
                "CARD_CREATED",
                "CARD_UPDATED",
                "CARD_MOVED",
                "CARD_ARCHIVED",
                "CARD_RESTORED",
                "COMMENT_CREATED",
                "COLUMN_CREATED",
                "COLUMN_UPDATED",
                "COLUMN_DELETED",
                "CARD_IMPORTED",
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 60,
          include: { user: { select: { id: true, name: true } } },
        }),
  ]);
  const columnTitle = new Map(columns.map(column => [column.id, column.title]));
  const batchIds = logs.map(log => (log.beforeState as { batchId?: string } | null)?.batchId).filter((id): id is string => Boolean(id));
  const batchEvents = batchIds.length
    ? await prisma.activityEvent.findMany({
        where: { workspaceId, batchId: { in: batchIds }, undoable: true },
        select: { batchId: true, type: true, entityId: true, beforeState: true, afterState: true },
      })
    : [];
  const changesFor = (batchId?: string) =>
    batchEvents
      .filter(event => event.batchId === batchId)
      .map(event => {
        const before = event.beforeState as State;
        const after = event.afterState as State;
        const fromColumn = before?.columnId ? (columnTitle.get(String(before.columnId)) ?? null) : null;
        const toColumn = after?.columnId && after.columnId !== before?.columnId ? (columnTitle.get(String(after.columnId)) ?? null) : null;
        return { cardId: event.entityId, type: event.type, title: String(after?.title || before?.title || ""), fromColumn, toColumn };
      });
  return NextResponse.json({
    updates: logs.map(log => ({
      id: log.id,
      kind: "ai" as const,
      inputText: log.inputText,
      summary: log.summary,
      source: log.source,
      createdAt: log.createdAt,
      undoneAt: log.undoneAt,
      user: log.user,
      changes: changesFor((log.beforeState as { batchId?: string } | null)?.batchId),
    })),
    events: events.map(event => {
      const before = event.beforeState as State;
      const after = event.afterState as State;
      return {
        id: event.id,
        kind: "manual" as const,
        type: event.type,
        createdAt: event.createdAt,
        user: event.user,
        entityId: event.entityId,
        title: String(after?.title || before?.title || ""),
        toColumn: after?.columnChanged && after.columnId ? (columnTitle.get(String(after.columnId)) ?? null) : null,
      };
    }),
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertBoardAccess, BoardAccessError, bumpRevision, isBoardConflict, logActivity } from "@/lib/board";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";

const patchSchema = z.object({ title: z.string().trim().min(1).max(80).optional(), description: z.string().max(500).optional() });
const deleteSchema = z.object({ destinationColumnId: z.string().cuid().optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; columnId: string }> }) {
  const { slug, columnId } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const { workspace, user } = ctx;
  const column = await prisma.boardColumn.findFirst({ where: { id: columnId, workspaceId: workspace.id } });
  if (!column) return apiError(request, "NOT_FOUND", 404);
  try {
    const result = await prisma.$transaction(async tx => {
      if ((await assertBoardAccess(workspace.id, tx, { userId: user.id, manageColumns: true })) === null) throw new BoardAccessError();
      const updated = await tx.boardColumn.update({
        where: { id: columnId },
        data: { title: parsed.data.title, description: parsed.data.description },
      });
      await logActivity(tx, {
        organizationId: workspace.organizationId,
        workspaceId: workspace.id,
        userId: user.id,
        type: "COLUMN_UPDATED",
        entityType: "COLUMN",
        entityId: columnId,
        beforeState: { title: column.title },
        afterState: { title: updated.title },
      });
      return { column: updated, revision: (await bumpRevision(tx, workspace.id)).revision };
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isBoardConflict(error)) return apiError(request, "BOARD_CONFLICT", 409);
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; columnId: string }> }) {
  const { slug, columnId } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const { workspace, user } = ctx;
  const columns = await prisma.boardColumn.findMany({ where: { workspaceId: workspace.id }, orderBy: { position: "asc" } });
  if (columns.length <= 1) return apiError(request, "LAST_COLUMN", 400);
  if (!columns.some(c => c.id === columnId)) return apiError(request, "NOT_FOUND", 404);
  const count = await prisma.card.count({ where: { columnId } });
  const destination = parsed.data.destinationColumnId;
  if (count && (!destination || destination === columnId || !columns.some(c => c.id === destination)))
    return apiError(request, "INVALID_INPUT", 400);
  try {
    const revision = await prisma.$transaction(async tx => {
      if ((await assertBoardAccess(workspace.id, tx, { userId: user.id, manageColumns: true })) === null) throw new BoardAccessError();
      if (count) await tx.card.updateMany({ where: { columnId }, data: { columnId: destination!, version: { increment: 1 } } });
      await tx.boardColumn.delete({ where: { id: columnId } });
      const remaining = columns.filter(c => c.id !== columnId);
      for (const [position, column] of remaining.entries()) await tx.boardColumn.update({ where: { id: column.id }, data: { position } });
      await logActivity(tx, {
        organizationId: workspace.organizationId,
        workspaceId: workspace.id,
        userId: user.id,
        type: "COLUMN_DELETED",
        entityType: "COLUMN",
        entityId: columnId,
        beforeState: { title: columns.find(c => c.id === columnId)?.title ?? "" },
      });
      return (await bumpRevision(tx, workspace.id)).revision;
    });
    return NextResponse.json({ revision });
  } catch (error) {
    if (isBoardConflict(error)) return apiError(request, "BOARD_CONFLICT", 409);
    throw error;
  }
}

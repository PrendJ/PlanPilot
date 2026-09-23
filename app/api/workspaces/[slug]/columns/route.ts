import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertBoardAccess, BoardAccessError, bumpRevision, isBoardConflict, logActivity } from "@/lib/board";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";

const createSchema = z.object({ title: z.string().trim().min(1).max(80), description: z.string().max(500).default("") });
const reorderSchema = z.object({ columnIds: z.array(z.string().cuid()).min(1).max(12) });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const { workspace, user } = ctx;
  try {
    const result = await prisma.$transaction(async tx => {
      if ((await assertBoardAccess(workspace.id, tx, { userId: user.id, manageColumns: true })) === null) throw new BoardAccessError();
      const position = await tx.boardColumn.count({ where: { workspaceId: workspace.id } });
      if (position >= 12) throw new Error("COLUMN_LIMIT");
      const column = await tx.boardColumn.create({
        data: {
          workspaceId: workspace.id,
          title: parsed.data.title,
          description: parsed.data.description,
          semanticKey: "CUSTOM",
          position,
        },
      });
      await logActivity(tx, {
        organizationId: workspace.organizationId,
        workspaceId: workspace.id,
        userId: user.id,
        type: "COLUMN_CREATED",
        entityType: "COLUMN",
        entityId: column.id,
        afterState: { title: column.title },
      });
      return { column, revision: (await bumpRevision(tx, workspace.id)).revision };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "COLUMN_LIMIT") return apiError(request, "COLUMN_LIMIT", 400);
    if (isBoardConflict(error)) return apiError(request, "BOARD_CONFLICT", 409);
    throw error;
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  const parsed = reorderSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || new Set(parsed.data.columnIds).size !== parsed.data.columnIds.length)
    return apiError(request, "INVALID_INPUT", 400);
  const { workspace, user } = ctx;
  try {
    const revision = await prisma.$transaction(async tx => {
      if ((await assertBoardAccess(workspace.id, tx, { userId: user.id, manageColumns: true })) === null) throw new BoardAccessError();
      const current = await tx.boardColumn.findMany({ where: { workspaceId: workspace.id }, select: { id: true } });
      if (current.length !== parsed.data.columnIds.length || current.some(column => !parsed.data.columnIds.includes(column.id)))
        throw new Error("INCOMPLETE");
      for (const [position, id] of parsed.data.columnIds.entries()) await tx.boardColumn.update({ where: { id }, data: { position } });
      await logActivity(tx, {
        organizationId: workspace.organizationId,
        workspaceId: workspace.id,
        userId: user.id,
        type: "COLUMNS_REORDERED",
        entityType: "COLUMN",
        afterState: parsed.data.columnIds,
      });
      return (await bumpRevision(tx, workspace.id)).revision;
    });
    return NextResponse.json({ revision });
  } catch (error) {
    if (error instanceof Error && error.message === "INCOMPLETE") return apiError(request, "BOARD_CONFLICT", 409);
    if (isBoardConflict(error)) return apiError(request, "BOARD_CONFLICT", 409);
    throw error;
  }
}

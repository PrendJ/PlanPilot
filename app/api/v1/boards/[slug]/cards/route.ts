import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v1Board, v1Error } from "@/lib/api-v1";
import { assertBoardAccess, BoardAccessError, bumpRevision, isBoardConflict, logActivity, placeCard } from "@/lib/board";
import { cardCreateSchema } from "@/lib/card-schema";

const publicCard = {
  id: true,
  title: true,
  description: true,
  priority: true,
  dueDate: true,
  tags: true,
  checklist: true,
  columnId: true,
  archived: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await v1Board(request, slug);
  if (ctx instanceof NextResponse) return ctx;
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  const cards = await prisma.card.findMany({
    where: { workspaceId: ctx.workspace.id, archived },
    orderBy: [{ columnId: "asc" }, { position: "asc" }],
    select: publicCard,
    take: 2000,
  });
  return NextResponse.json({ data: cards });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await v1Board(request, slug, true);
  if (ctx instanceof NextResponse) return ctx;
  const parsed = cardCreateSchema.omit({ assigneeIds: true }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return v1Error(400, "INVALID_INPUT", "Invalid card payload");
  const body = parsed.data;
  if (!(await prisma.boardColumn.findFirst({ where: { id: body.columnId, workspaceId: ctx.workspace.id }, select: { id: true } })))
    return v1Error(400, "INVALID_INPUT", "Unknown columnId");
  try {
    const card = await prisma.$transaction(async tx => {
      if ((await assertBoardAccess(ctx.workspace.id, tx, { userId: ctx.user.id })) === null) throw new BoardAccessError();
      const created = await tx.card.create({
        data: {
          workspaceId: ctx.workspace.id,
          columnId: body.columnId,
          title: body.title,
          description: body.description,
          priority: body.priority,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          tags: body.tags,
          checklist: body.checklist,
          position: 100000,
        },
      });
      await placeCard(tx, ctx.workspace.id, body.columnId, created.id, body.index ?? 0);
      await logActivity(tx, {
        organizationId: ctx.workspace.organizationId,
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        type: "CARD_CREATED",
        entityType: "CARD",
        entityId: created.id,
        afterState: { title: created.title, columnId: created.columnId, via: "api" },
      });
      await bumpRevision(tx, ctx.workspace.id);
      return tx.card.findUniqueOrThrow({ where: { id: created.id }, select: publicCard });
    });
    return NextResponse.json({ data: card }, { status: 201 });
  } catch (error) {
    if (isBoardConflict(error)) return v1Error(409, "CONFLICT", "Board not writable");
    throw error;
  }
}

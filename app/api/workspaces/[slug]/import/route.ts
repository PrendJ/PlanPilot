import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertBoardAccess, BoardAccessError, bumpRevision, isBoardConflict, logActivity } from "@/lib/board";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { MAX_IMPORT_CARDS, parseCsv, parseTrello, type ImportedBoard } from "@/lib/import-export";
import { trackEvent } from "@/lib/product-events";

const schema = z.object({ format: z.enum(["trello", "csv"]), content: z.string().min(2).max(15_000_000) });

/** Imports a Trello JSON export or a CSV into this board. Columns are matched by name; missing ones are created (max 12). */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "IMPORT_INVALID", 400);
  let board: ImportedBoard;
  try {
    board = parsed.data.format === "trello" ? parseTrello(JSON.parse(parsed.data.content)) : parseCsv(parsed.data.content);
  } catch {
    return apiError(request, "IMPORT_INVALID", 400);
  }
  const total = board.columns.reduce((sum, column) => sum + column.cards.length, 0);
  if (!total || total > MAX_IMPORT_CARDS) return apiError(request, "IMPORT_INVALID", 400);
  const { workspace, user } = ctx;
  try {
    const result = await prisma.$transaction(
      async tx => {
        if ((await assertBoardAccess(workspace.id, tx, { userId: user.id, manageColumns: true })) === null) throw new BoardAccessError();
        const existing = await tx.boardColumn.findMany({ where: { workspaceId: workspace.id }, orderBy: { position: "asc" } });
        const byTitle = new Map(existing.map(column => [column.title.trim().toLowerCase(), column.id]));
        let createdColumns = 0;
        let createdCards = 0;
        for (const column of board.columns) {
          let columnId = byTitle.get(column.title.trim().toLowerCase());
          if (!columnId) {
            if (existing.length + createdColumns >= 12) columnId = existing[0].id;
            else {
              const created = await tx.boardColumn.create({
                data: {
                  workspaceId: workspace.id,
                  title: column.title,
                  description: "",
                  semanticKey: "CUSTOM",
                  position: existing.length + createdColumns,
                },
              });
              createdColumns += 1;
              columnId = created.id;
              byTitle.set(column.title.trim().toLowerCase(), columnId);
            }
          }
          const offset = await tx.card.count({ where: { columnId } });
          await tx.card.createMany({
            data: column.cards.map((card, index) => ({
              workspaceId: workspace.id,
              columnId: columnId!,
              title: card.title,
              description: card.description,
              priority: card.priority,
              dueDate: card.dueDate,
              tags: card.tags,
              checklist: card.checklist,
              archived: card.archived,
              position: offset + index,
            })),
          });
          createdCards += column.cards.length;
        }
        await logActivity(tx, {
          organizationId: workspace.organizationId,
          workspaceId: workspace.id,
          userId: user.id,
          type: "BOARD_IMPORTED",
          entityType: "WORKSPACE",
          entityId: workspace.id,
          afterState: { format: parsed.data.format, cards: createdCards, columns: createdColumns },
        });
        const revision = (await bumpRevision(tx, workspace.id)).revision;
        return { createdCards, createdColumns, revision };
      },
      { timeout: 60_000 },
    );
    await trackEvent("import_completed");
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (isBoardConflict(error)) return apiError(request, "BOARD_CONFLICT", 409);
    throw error;
  }
}

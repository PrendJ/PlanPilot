import { NextResponse } from "next/server";
import { getCurrentUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { isDoneColumn } from "@/lib/board-state";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

const cardSelect = {
  id: true,
  title: true,
  dueDate: true,
  priority: true,
  column: { select: { title: true, semanticKey: true, position: true } },
  workspace: { select: { id: true, slug: true, name: true } },
} as const;

/**
 * The user's day across every board: overdue and due-today work, plus undated work in progress.
 * Cards assigned only to other people are left out. The browser applies the exact local-day boundary.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  if (await twoFactorRequiredButMissing(user)) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 403);
  const localDate = new URL(request.url).searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !Number.isFinite(Date.parse(`${localDate}T00:00:00Z`)))
    return apiError(request, "INVALID_INPUT", 400);
  // The 14-hour buffer covers every current UTC offset; the browser applies its exact local-day boundary.
  const cutoff = new Date(Date.parse(`${localDate}T00:00:00Z`) + 38 * 3_600_000);
  const base = {
    archived: false,
    column: { semanticKey: { not: "DONE" } },
    workspace: { lifecycleStatus: "ACTIVE" as const, members: { some: { userId: user.id } } },
    OR: [{ assignees: { none: {} } }, { assignees: { some: { userId: user.id } } }],
  };
  const [due, active] = await Promise.all([
    prisma.card.findMany({
      where: { ...base, dueDate: { not: null, lt: cutoff } },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 300,
      select: cardSelect,
    }),
    prisma.card.findMany({
      where: { ...base, dueDate: null, column: { semanticKey: "ACTIVE" } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: cardSelect,
    }),
  ]);
  const workspaceIds = [...new Set([...due, ...active].map(card => card.workspace.id))];
  const last = new Map(
    (await prisma.boardColumn.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: workspaceIds } }, _max: { position: true } })).map(
      row => [row.workspaceId, row._max.position ?? 0],
    ),
  );
  // Same rule as the board: the last column, or a column titled like "done", counts as finished.
  const open = (card: (typeof due)[number]) => {
    const lastPosition = last.get(card.workspace.id) ?? 0;
    return !isDoneColumn(card.column, card.column.position, lastPosition + 1);
  };
  const view = (card: (typeof due)[number]) => ({
    id: card.id,
    title: card.title,
    dueDate: card.dueDate,
    priority: card.priority,
    column: card.column.title,
    board: card.workspace.name,
    slug: card.workspace.slug,
  });
  return NextResponse.json({ cards: due.filter(open).slice(0, 150).map(view), active: active.filter(open).map(view) });
}

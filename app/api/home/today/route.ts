import { NextResponse } from "next/server";
import { getApiUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { isDoneColumn } from "@/lib/board-state";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

const cardSelect = {
  id: true,
  title: true,
  dueDate: true,
  priority: true,
  column: { select: { id: true, title: true, semanticKey: true, position: true } },
  workspace: { select: { id: true, slug: true, name: true } },
} as const;

/**
 * The user's agenda across every board: overdue, today, the next seven days and undated work in progress.
 * Cards assigned only to other people are left out. The browser applies the exact local-day boundary.
 */
export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  if (await twoFactorRequiredButMissing(user)) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 403);
  const localDate = new URL(request.url).searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !Number.isFinite(Date.parse(`${localDate}T00:00:00Z`)))
    return apiError(request, "INVALID_INPUT", 400);
  // The 14-hour buffer covers every current UTC offset; the browser applies its exact local-day boundary.
  const cutoff = new Date(Date.parse(`${localDate}T00:00:00Z`) + (7 * 24 + 38) * 3_600_000);
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
      select: cardSelect,
    }),
    prisma.card.findMany({
      where: { ...base, dueDate: null, column: { semanticKey: "ACTIVE" } },
      orderBy: { updatedAt: "desc" },
      select: cardSelect,
    }),
  ]);
  const workspaceIds = [...new Set([...due, ...active].map(card => card.workspace.id))];
  const columns = await prisma.boardColumn.findMany({
    where: { workspaceId: { in: workspaceIds } },
    orderBy: { position: "asc" },
    select: { id: true, title: true, semanticKey: true, position: true, workspaceId: true },
  });
  const byWorkspace = new Map<string, typeof columns>();
  for (const column of columns) byWorkspace.set(column.workspaceId, [...(byWorkspace.get(column.workspaceId) || []), column]);
  const doneColumn = new Map([...byWorkspace].map(([id, list]) => [id, list.find(column => isDoneColumn(column))?.id ?? null]));
  const open = (card: (typeof due)[number]) => !isDoneColumn(card.column);
  const view = (card: (typeof due)[number]) => ({
    id: card.id,
    title: card.title,
    dueDate: card.dueDate,
    priority: card.priority,
    column: card.column.title,
    columnId: card.column.id,
    doneColumnId: doneColumn.get(card.workspace.id) ?? null,
    board: card.workspace.name,
    slug: card.workspace.slug,
  });
  return NextResponse.json({ cards: due.filter(open).map(view), active: active.filter(open).map(view) });
}

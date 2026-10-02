import { isDoneColumn } from "@/lib/board-state";
import { feedTokenHash, renderCalendarFeed } from "@/lib/calendar-feed";
import { appUrl } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/security";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return new Response("Not found", { status: 404 });
  const tokenHash = feedTokenHash(token);
  // Calendar apps poll every 15-60 minutes; this only stops runaway clients and token probing.
  const limited = await rateLimit(`calendar-feed-read:${tokenHash}`, 60, 3600_000, request);
  if (limited) return limited;
  const feed = await prisma.calendarFeed.findUnique({
    where: { tokenHash },
    select: { userId: true, timeZone: true, user: { select: { lifecycleStatus: true, emailVerifiedAt: true } } },
  });
  if (!feed || feed.user.lifecycleStatus !== "ACTIVE" || !feed.user.emailVerifiedAt) return new Response("Not found", { status: 404 });
  const cards = await prisma.card.findMany({
    where: {
      archived: false,
      dueDate: { gte: new Date(Date.now() - 365 * 86_400_000) },
      column: { semanticKey: { not: "DONE" } },
      workspace: { lifecycleStatus: "ACTIVE", organization: { lifecycleStatus: "ACTIVE" }, members: { some: { userId: feed.userId } } },
    },
    select: {
      id: true,
      title: true,
      description: true,
      dueDate: true,
      updatedAt: true,
      column: { select: { title: true, semanticKey: true, position: true } },
      workspace: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 2000,
  });
  const last = new Map(
    (
      await prisma.boardColumn.groupBy({
        by: ["workspaceId"],
        where: { workspaceId: { in: [...new Set(cards.map(card => card.workspace.id))] } },
        _max: { position: true },
      })
    ).map(row => [row.workspaceId, row._max.position ?? 0]),
  );
  // Same rule as the board and the home: the last column, or one titled like "done", is finished work.
  const open = cards.filter(card => !isDoneColumn(card.column, card.column.position, (last.get(card.workspace.id) ?? 0) + 1));
  const origin = new URL(appUrl("/", request)).origin;
  const body = renderCalendarFeed(
    open.filter(card => card.dueDate !== null) as Parameters<typeof renderCalendarFeed>[0],
    feed.timeZone,
    origin,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=boardcue.ics",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/errors";

/** Cross-board search over card titles, descriptions and tags, limited to boards the person belongs to. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const cards = await prisma.card.findMany({
    where: {
      archived: false,
      workspace: { lifecycleStatus: "ACTIVE", members: { some: { userId: user.id } } },
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { tags: { array_contains: [q] } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      dueDate: true,
      column: { select: { title: true } },
      workspace: { select: { name: true, slug: true } },
    },
  });
  return NextResponse.json({
    results: cards.map(card => ({
      id: card.id,
      title: card.title,
      dueDate: card.dueDate,
      column: card.column.title,
      board: card.workspace.name,
      slug: card.workspace.slug,
    })),
  });
}

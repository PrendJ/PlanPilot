import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const actorIds = [...new Set(items.map(item => item.actorId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(actors.map(actor => [actor.id, actor.name]));
  return NextResponse.json({
    unread,
    items: items.map(item => ({
      id: item.id,
      type: item.type,
      payload: item.payload,
      cardId: item.cardId,
      readAt: item.readAt,
      createdAt: item.createdAt,
      actorName: item.actorId ? (names.get(item.actorId) ?? null) : null,
    })),
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const parsed = z
    .object({ ids: z.array(z.string().cuid()).max(100).optional(), all: z.boolean().optional() })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(parsed.data.all ? {} : { id: { in: parsed.data.ids || [] } }) },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

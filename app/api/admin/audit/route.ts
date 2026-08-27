import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatform } from "@/lib/platform-access";

export async function GET(request: Request) {
  const access = await requirePlatform("METADATA"); if ("error" in access) return access.error;
  const url = new URL(request.url); const take = Math.min(Math.max(Number(url.searchParams.get("take") || 50), 1), 100); const cursor = url.searchParams.get("cursor") || undefined; const targetType = url.searchParams.get("targetType") || undefined;
  const rows = await prisma.adminAuditEvent.findMany({ where: targetType ? { targetType } : undefined, take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: { createdAt: "desc" }, select: { id: true, action: true, targetType: true, targetId: true, createdAt: true, actor: { select: { name: true, email: true } } } });
  const next = rows.length > take ? rows.pop()?.id : undefined; return NextResponse.json({ events: rows, nextCursor: next });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRevision, bumpRevision, logActivity, workspaceForUser, workspaceReadOnly } from "@/lib/board";

const schema = z.object({ columnId: z.string().cuid(), title: z.string().trim().min(1).max(180), description: z.string().max(10000).default(""), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"), dueDate: z.string().datetime().nullable().optional(), tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]), assigneeIds: z.array(z.string().cuid()).max(16).default([]), revision: z.number().int().nonnegative() });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params; const workspace = await workspaceForUser(slug, user.id); if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (workspaceReadOnly(workspace)) return NextResponse.json({ error: "Organization is read-only" }, { status: 423 });
  const parsed = schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Invalid card data", details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  if (!(await prisma.boardColumn.findFirst({ where: { id: body.columnId, workspaceId: workspace.id } }))) return NextResponse.json({ error: "Column not found" }, { status: 400 });
  if (await prisma.workspaceMember.count({ where: { workspaceId: workspace.id, userId: { in: body.assigneeIds } } }) !== new Set(body.assigneeIds).size) return NextResponse.json({ error: "Assignees must belong to this workspace" }, { status: 400 });
  try { const result = await prisma.$transaction(async (tx) => { if (!(await assertRevision(workspace.id, body.revision, tx))) throw new Error("STALE_REVISION"); const position = await tx.card.count({ where: { columnId: body.columnId, archived: false } }); const card = await tx.card.create({ data: { workspaceId: workspace.id, columnId: body.columnId, title: body.title, description: body.description, priority: body.priority, dueDate: body.dueDate ? new Date(body.dueDate) : null, tags: body.tags, position, assignees: { create: body.assigneeIds.map((userId) => ({ userId })) } }, include: { assignees: { include: { user: { select: { id: true, name: true, email: true } } } } } }); await logActivity(tx, { organizationId: workspace.organizationId, workspaceId: workspace.id, userId: user.id, type: "CARD_CREATED", entityType: "CARD", entityId: card.id, afterState: card as never }); const revision = (await bumpRevision(tx, workspace.id)).revision; return { card, revision }; }); return NextResponse.json(result, { status: 201 }); } catch (error) { if (error instanceof Error && error.message === "STALE_REVISION") return NextResponse.json({ error: "Board changed. Reload and retry." }, { status: 409 }); throw error; }
}

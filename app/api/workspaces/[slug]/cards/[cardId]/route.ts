import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { assertRevision, bumpRevision, logActivity, workspaceForUser, workspaceReadOnly } from "@/lib/board";

const cardPatch = z.object({ columnId: z.string().cuid().optional(), title: z.string().trim().min(1).max(180).optional(), description: z.string().max(10000).optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(), dueDate: z.string().datetime().nullable().optional(), tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(), assigneeIds: z.array(z.string().cuid()).max(16).optional(), archived: z.boolean().optional(), revision: z.number().int().nonnegative() });

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; cardId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug, cardId } = await params;
  const workspace = await workspaceForUser(slug, user.id);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (workspaceReadOnly(workspace)) return NextResponse.json({ error: "Organization is read-only" }, { status: 423 });
  const card = await prisma.card.findFirst({ where: { id: cardId, workspaceId: workspace.id }, include: { assignees: true } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const parsed = cardPatch.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid card data", details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  if (body.columnId && !(await prisma.boardColumn.findFirst({ where: { id: body.columnId, workspaceId: workspace.id } }))) return NextResponse.json({ error: "Column not found" }, { status: 400 });
  if (body.assigneeIds && await prisma.workspaceMember.count({ where: { workspaceId: workspace.id, userId: { in: body.assigneeIds } } }) !== new Set(body.assigneeIds).size) return NextResponse.json({ error: "Assignees must belong to this workspace" }, { status: 400 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (!(await assertRevision(workspace.id, body.revision, tx))) throw new Error("STALE_REVISION");
      const data = { ...(body.columnId && { columnId: body.columnId }), ...(body.title && { title: body.title }), ...(body.description !== undefined && { description: body.description }), ...(body.priority && { priority: body.priority }), ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }), ...(body.tags && { tags: body.tags }), ...(body.archived !== undefined && { archived: body.archived }) };
      const updated = await tx.card.update({ where: { id: cardId }, data, include: { assignees: { include: { user: { select: { id: true, name: true, email: true } } } } } });
      if (body.assigneeIds) { await tx.cardAssignee.deleteMany({ where: { cardId } }); await tx.cardAssignee.createMany({ data: [...new Set(body.assigneeIds)].map((userId) => ({ cardId, userId })) }); }
      await logActivity(tx, { organizationId: workspace.organizationId, workspaceId: workspace.id, userId: user.id, type: body.archived === true ? "CARD_ARCHIVED" : body.archived === false ? "CARD_RESTORED" : "CARD_UPDATED", entityType: "CARD", entityId: cardId, beforeState: card as never, afterState: updated as never });
      const revision = (await bumpRevision(tx, workspace.id)).revision;
      return { card: updated, revision };
    });
    return NextResponse.json(result);
  } catch (error) { if (error instanceof Error && error.message === "STALE_REVISION") return NextResponse.json({ error: "Board changed. Reload and retry." }, { status: 409 }); throw error; }
}

export async function DELETE(request: Request, context: { params: Promise<{ slug: string; cardId: string }> }) {
  const body = await request.json().catch(() => ({}));
  return PATCH(new Request(request.url, { method: "PATCH", headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" }, body: JSON.stringify({ revision: body.revision, archived: true }) }), context);
}

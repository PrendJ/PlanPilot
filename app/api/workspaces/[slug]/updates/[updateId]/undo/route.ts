import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRevision, isBoardConflict, bumpRevision, workspaceForUser, workspaceReadOnly } from "@/lib/board";
import { rejectCrossOrigin } from "@/lib/security";

const schema = z.object({ revision: z.number().int().nonnegative() });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; updateId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(request); if (originError) return originError;
  const { slug, updateId } = await params;
  const workspace = await workspaceForUser(slug, user.id);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (workspaceReadOnly(workspace)) return NextResponse.json({ error: "Organization is read-only" }, { status: 423 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid revision" }, { status: 400 });

  try {
    const revision = await prisma.$transaction(async tx => {
      if (!(await assertRevision(workspace.id, parsed.data.revision, tx, { userId: user.id }))) throw new Error("STALE_REVISION");
      const log = await tx.updateLog.findFirst({ where: { id: updateId, workspaceId: workspace.id, undoneAt: null } });
      const state = log?.beforeState as { batchId?: string } | null;
      if (!log || !state?.batchId) throw new Error("NOT_UNDOABLE");
      const events = await tx.activityEvent.findMany({
        where: { batchId: state.batchId, workspaceId: workspace.id, organizationId: workspace.organizationId, undoable: true, undoneAt: null },
        orderBy: { createdAt: "desc" },
      });
      if (!Array.isArray(log.actions) || events.length !== log.actions.length
        || new Set(events.map(event => event.entityId)).size !== events.length) throw new Error("UNDO_CONFLICT");
      for (const event of events) {
        const before = event.beforeState as Record<string, unknown> | null;
        const after = event.afterState as Record<string, unknown> | null;
        if (!event.entityId || !after?.updatedAt || !["AI_CARD_CREATED", "AI_CARD_UPDATED", "AI_CARD_ARCHIVED"].includes(event.type)) throw new Error("UNDO_CONFLICT");
        const current = await tx.card.findFirst({ where: { id: event.entityId, workspaceId: workspace.id }, include: { assignees: true } });
        if (!current || current.updatedAt.toISOString() !== new Date(String(after.updatedAt)).toISOString()) throw new Error("UNDO_CONFLICT");
        if (event.type === "AI_CARD_CREATED") {
          if (current.assignees.length) throw new Error("UNDO_CONFLICT");
          await tx.card.deleteMany({ where: { id: event.entityId, workspaceId: workspace.id } });
        } else {
          if (!before || !(await tx.boardColumn.findFirst({ where: { id: String(before.columnId), workspaceId: workspace.id }, select: { id: true } }))) throw new Error("UNDO_CONFLICT");
          await tx.card.update({
            where: { id: event.entityId, workspaceId: workspace.id },
            data: { columnId: String(before.columnId), title: String(before.title), description: String(before.description || ""), priority: String(before.priority || "NORMAL"), dueDate: before.dueDate ? new Date(String(before.dueDate)) : null, tags: (before.tags || []) as never, position: Number(before.position || 0), archived: Boolean(before.archived) },
          });
        }
        await tx.activityEvent.update({ where: { id: event.id }, data: { undoneAt: new Date() } });
      }
      await tx.updateLog.update({ where: { id: log.id }, data: { undoneAt: new Date() } });
      return (await bumpRevision(tx, workspace.id)).revision;
    });
    return NextResponse.json({ revision });
  } catch (error) {
    if (isBoardConflict(error)) return NextResponse.json({ error: "Board o accesso modificati. Ricarica e riprova." }, { status: 409 });
    if (error instanceof Error && error.message === "NOT_UNDOABLE") return NextResponse.json({ error: "This update cannot be undone" }, { status: 400 });
    if (error instanceof Error && error.message === "UNDO_CONFLICT") return NextResponse.json({ error: "Una card è cambiata dopo l’aggiornamento AI. Annullamento non applicato." }, { status: 409 });
    throw error;
  }
}

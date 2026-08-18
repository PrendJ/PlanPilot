import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceApiKey } from "@/lib/workspace";
import { planPatchFromText } from "@/lib/openrouter";
import { getUsageStatus, recordUsage } from "@/lib/plans";
import { rejectCrossOrigin, rateLimit } from "@/lib/security";
import { assertRevision, bumpRevision, logActivity, workspaceForUser } from "@/lib/board";
import { z } from "zod";

const schema = z.object({ text: z.string().trim().min(1).max(12000), source: z.enum(["text", "voice"]).default("text"), revision: z.number().int().nonnegative() });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const originError = rejectCrossOrigin(request); if (originError) return originError;
  const limited = rateLimit(`ai:${user.id}`, 20, 60_000); if (limited) return limited;
  const { slug } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const { text, source, revision } = parsed.data;

  const access = await workspaceForUser(slug, user.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const quota = await getUsageStatus(access.organizationId);
  if (!quota || quota.status === "PAUSED") return NextResponse.json({ error: "AI quota reached or subscription inactive" }, { status: 402 });
  const workspace = await prisma.workspace.findUnique({
    where: { id: access.id },
    include: { columns: { orderBy: { position: "asc" }, include: { cards: { where: { archived: false }, orderBy: { position: "asc" } } } } },
  });
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (workspace.revision !== revision) return NextResponse.json({ error: "Board changed. Reload and retry." }, { status: 409 });
  const apiKey = getWorkspaceApiKey(workspace);
  if (!apiKey) return NextResponse.json({ error: "AI service is not configured" }, { status: 503 });

  const compactPlan = {
    columns: workspace.columns.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      cards: c.cards.map((card) => ({
        id: card.id,
        title: card.title,
        description: card.description,
        priority: card.priority,
        dueDate: card.dueDate?.toISOString() || null,
        tags: card.tags,
      })),
    })),
  };

  try {
    const { patch, usage, requestId } = await planPatchFromText({ apiKey, model: workspace.planModel, workspaceName: workspace.name, userText: text, plan: compactPlan });
    const columnsById = new Map(workspace.columns.map((c) => [c.id, c]));
    const existingCards = new Map(workspace.columns.flatMap((c) => c.cards).map((c) => [c.id, c]));
    const applied: typeof patch.actions = [];

    const batchId = crypto.randomUUID();
    const newRevision = await prisma.$transaction(async (tx) => {
      if (!(await assertRevision(workspace.id, revision, tx))) throw new Error("STALE_REVISION");
      for (const action of patch.actions) {
        if (action.action === "create") {
          if (!action.title || !action.targetColumnId || !columnsById.has(action.targetColumnId)) continue;
          const count = await tx.card.count({ where: { columnId: action.targetColumnId, archived: false } });
          const created = await tx.card.create({ data: { workspaceId: workspace.id, columnId: action.targetColumnId, title: action.title.slice(0, 180), description: action.description || "", priority: action.priority || "NORMAL", dueDate: action.dueDate ? new Date(action.dueDate) : null, tags: action.tags || [], position: count } });
          await logActivity(tx, { organizationId: access.organizationId, workspaceId: workspace.id, userId: user.id, type: "AI_CARD_CREATED", entityType: "CARD", entityId: created.id, batchId, afterState: created as never, undoable: true });
          applied.push(action);
          continue;
        }
        if (!action.cardId || !existingCards.has(action.cardId)) continue;
        if (action.action === "archive") {
          const changed = await tx.card.update({ where: { id: action.cardId }, data: { archived: true } });
          await logActivity(tx, { organizationId: access.organizationId, workspaceId: workspace.id, userId: user.id, type: "AI_CARD_ARCHIVED", entityType: "CARD", entityId: action.cardId, batchId, beforeState: existingCards.get(action.cardId) as never, afterState: changed as never, undoable: true });
          applied.push(action);
          continue;
        }
        const data: any = {};
        if (action.action === "move" && action.targetColumnId && columnsById.has(action.targetColumnId)) data.columnId = action.targetColumnId;
        if (action.action === "update") {
          if (action.title) data.title = action.title.slice(0, 180);
          if (action.description !== null) data.description = action.description;
          if (action.priority) data.priority = action.priority;
          if (action.dueDate !== null) data.dueDate = action.dueDate ? new Date(action.dueDate) : null;
          if (action.tags !== null) data.tags = action.tags;
          if (action.targetColumnId && columnsById.has(action.targetColumnId)) data.columnId = action.targetColumnId;
        }
        if (Object.keys(data).length) {
          const changed = await tx.card.update({ where: { id: action.cardId }, data });
          await logActivity(tx, { organizationId: access.organizationId, workspaceId: workspace.id, userId: user.id, type: "AI_CARD_UPDATED", entityType: "CARD", entityId: action.cardId, batchId, beforeState: existingCards.get(action.cardId) as never, afterState: changed as never, undoable: true });
          applied.push(action);
        }
      }
      await tx.updateLog.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          source,
          inputText: text,
          summary: patch.summary,
          actions: applied,
          beforeState: { batchId },
          model: workspace.planModel,
          cost: typeof usage?.cost === "number" ? usage.cost : null,
        },
      });
      return (await bumpRevision(tx, workspace.id)).revision;
    });
    await recordUsage({ organizationId: access.organizationId, workspaceId: workspace.id, userId: user.id, providerRequestId: requestId, category: "PLANNING", model: workspace.planModel, costUsd: usage?.cost, metadata: { source } });
    return NextResponse.json({ ok: true, summary: patch.summary, actions: applied, revision: newRevision });
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_REVISION") return NextResponse.json({ error: "Board changed. Reload and retry." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI update failed" }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { getCurrentUser, canAccessWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceApiKey } from "@/lib/workspace";
import { planPatchFromText } from "@/lib/openrouter";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  const source = body.source === "voice" ? "voice" : "text";
  if (!text) return NextResponse.json({ error: "Text required" }, { status: 400 });

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    include: { columns: { orderBy: { position: "asc" }, include: { cards: { where: { archived: false }, orderBy: { position: "asc" } } } } },
  });
  if (!workspace || !(await canAccessWorkspace(user.id, workspace.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const apiKey = getWorkspaceApiKey(workspace);
  if (!apiKey) return NextResponse.json({ error: `OpenRouter key missing. Configure ${workspace.openrouterKeyEnv} or OPENROUTER_WORKSPACE_KEYS.` }, { status: 503 });

  const compactPlan = {
    columns: workspace.columns.map((c) => ({
      id: c.id,
      title: c.title,
      kind: c.kind,
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
    const { patch, usage } = await planPatchFromText({ apiKey, model: workspace.planModel, workspaceName: workspace.name, userText: text, plan: compactPlan });
    const columnsById = new Map(workspace.columns.map((c) => [c.id, c]));
    const existingCards = new Map(workspace.columns.flatMap((c) => c.cards).map((c) => [c.id, c]));
    const applied: typeof patch.actions = [];

    await prisma.$transaction(async (tx) => {
      for (const action of patch.actions) {
        if (action.action === "create") {
          if (!action.title || !action.targetColumnId || !columnsById.has(action.targetColumnId)) continue;
          const count = await tx.card.count({ where: { columnId: action.targetColumnId, archived: false } });
          await tx.card.create({ data: { workspaceId: workspace.id, columnId: action.targetColumnId, title: action.title.slice(0, 180), description: action.description || "", priority: action.priority || "NORMAL", dueDate: action.dueDate ? new Date(action.dueDate) : null, tags: action.tags || [], position: count } });
          applied.push(action);
          continue;
        }
        if (!action.cardId || !existingCards.has(action.cardId)) continue;
        if (action.action === "archive") {
          await tx.card.update({ where: { id: action.cardId }, data: { archived: true } });
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
          await tx.card.update({ where: { id: action.cardId }, data });
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
          model: workspace.planModel,
          cost: typeof usage?.cost === "number" ? usage.cost : null,
        },
      });
    });
    return NextResponse.json({ ok: true, summary: patch.summary, actions: applied, usage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI update failed" }, { status: 502 });
  }
}

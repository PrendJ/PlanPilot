import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildCompactPlan } from "@/lib/ai-context";
import { resolvePlanningModel } from "@/lib/ai-config";
import { selectActions, validateAiPatch } from "@/lib/ai-patch";
import { AiProviderError, planPatchFromText, type AiAction } from "@/lib/openrouter";
import { recordUsage, refundAiUpdate, reserveAiUpdate } from "@/lib/plans";
import { getWorkspaceApiKey } from "@/lib/workspace";
import { assertBoardAccess, BoardAccessError, bumpRevision, logActivity, markMilestone, placeCard } from "@/lib/board";
import { trackEvent } from "@/lib/product-events";

export const PROPOSAL_TTL_MS = 15 * 60_000;

type Workspace = {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  planModel: string;
  openrouterKeyEnv: string;
  locale: string;
};

export class ProposalError extends Error {
  constructor(code: "PROPOSAL_EXPIRED" | "PROPOSAL_STALE" | "NOT_FOUND" | "AI_NOT_CONFIGURED") {
    super(code);
  }
}

export type PreviewAction = {
  index: number;
  action: AiAction["action"];
  cardId: string | null;
  cardTitle: string | null;
  newTitle: string | null;
  fromColumn: string | null;
  toColumn: string | null;
  changes: Array<{ field: "priority" | "dueDate" | "tags" | "description" | "title"; from: string | null; to: string | null }>;
  reason: string;
};

type BoardSnapshot = {
  columns: Array<{
    id: string;
    title: string;
    cards: Array<{
      id: string;
      title: string;
      description: string;
      priority: string;
      dueDate: Date | null;
      tags: unknown;
      version: number;
      columnId: string;
    }>;
  }>;
};

/** Human-readable diff shown before anything is written. */
export function previewActions(actions: AiAction[], board: BoardSnapshot): PreviewAction[] {
  const columnTitle = new Map(board.columns.map(column => [column.id, column.title]));
  const cards = new Map(board.columns.flatMap(column => column.cards).map(card => [card.id, card]));
  return actions.map((action, index) => {
    const card = action.cardId ? cards.get(action.cardId) : undefined;
    const changes: PreviewAction["changes"] = [];
    if (action.action === "update" && card) {
      if (action.title && action.title !== card.title) changes.push({ field: "title", from: card.title, to: action.title });
      if (action.priority && action.priority !== card.priority)
        changes.push({ field: "priority", from: card.priority, to: action.priority });
      if (action.dueDate !== null)
        changes.push({ field: "dueDate", from: card.dueDate?.toISOString() ?? null, to: action.dueDate || null });
      if (action.tags !== null)
        changes.push({ field: "tags", from: Array.isArray(card.tags) ? card.tags.join(", ") : "", to: action.tags.join(", ") });
      if (action.description !== null && action.description !== card.description)
        changes.push({ field: "description", from: card.description.slice(0, 120), to: action.description.slice(0, 120) });
    }
    if (action.action === "create") {
      if (action.priority && action.priority !== "NORMAL") changes.push({ field: "priority", from: null, to: action.priority });
      if (action.dueDate) changes.push({ field: "dueDate", from: null, to: action.dueDate });
      if (action.tags?.length) changes.push({ field: "tags", from: null, to: action.tags.join(", ") });
    }
    const moving = action.targetColumnId && (!card || card.columnId !== action.targetColumnId);
    return {
      index,
      action: action.action,
      cardId: action.cardId,
      cardTitle: card?.title ?? null,
      newTitle: action.action === "create" ? action.title : null,
      fromColumn: card ? (columnTitle.get(card.columnId) ?? null) : null,
      toColumn: moving ? (columnTitle.get(action.targetColumnId!) ?? null) : null,
      changes,
      reason: action.reason,
    };
  });
}

async function loadBoard(workspaceId: string) {
  const columns = await prisma.boardColumn.findMany({
    where: { workspaceId },
    orderBy: { position: "asc" },
    include: { cards: { where: { archived: false }, orderBy: { position: "asc" } } },
  });
  return { columns };
}

export function proposalDto(
  proposal: {
    id: string;
    summary: string;
    actions: Prisma.JsonValue;
    clarification: Prisma.JsonValue | null;
    status: string;
    expiresAt: Date;
    inputText: string;
    source: string;
  },
  preview: PreviewAction[],
) {
  return {
    id: proposal.id,
    summary: proposal.summary,
    clarification: proposal.clarification,
    status: proposal.status,
    expiresAt: proposal.expiresAt,
    inputText: proposal.inputText,
    source: proposal.source,
    actions: preview,
  };
}

/**
 * Plans an update without writing to the board. One AI update is reserved before the provider call
 * (generations cost money even if later discarded).
 */
export async function createProposal(input: {
  workspace: Workspace;
  userId: string;
  text: string;
  source: "text" | "voice";
  now?: Date;
  timeZone?: string;
}) {
  const apiKey = getWorkspaceApiKey(input.workspace);
  if (!apiKey) throw new ProposalError("AI_NOT_CONFIGURED");
  const model = resolvePlanningModel(input.workspace.planModel);
  const reservation = await reserveAiUpdate({
    organizationId: input.workspace.organizationId,
    workspaceId: input.workspace.id,
    userId: input.userId,
    category: "AI_UPDATE",
    model,
    metadata: { source: input.source },
  });
  const board = await loadBoard(input.workspace.id);
  const plan = buildCompactPlan(
    board.columns.map(column => ({ id: column.id, title: column.title, description: column.description, cards: column.cards })),
    input.text,
  );
  let result: Awaited<ReturnType<typeof planPatchFromText>>;
  try {
    result = await planPatchFromText({
      apiKey,
      model,
      workspaceName: input.workspace.name,
      userText: input.text,
      plan,
      now: input.now,
      timeZone: input.timeZone,
      locale: input.workspace.locale,
    });
  } catch (error) {
    // The provider produced nothing usable: the person should not pay an update for our outage.
    if (error instanceof AiProviderError && error.message === "AI_UNAVAILABLE") await refundAiUpdate(reservation.id);
    throw error;
  }
  const { patch: candidate, usage, requestId } = result;
  await recordUsage({
    organizationId: input.workspace.organizationId,
    workspaceId: input.workspace.id,
    userId: input.userId,
    providerRequestId: requestId,
    category: "PLANNING",
    model,
    costUsd: usage?.cost,
    metadata: { source: input.source },
  });
  const allCards = board.columns.flatMap(column => column.cards);
  const patch = validateAiPatch(candidate, {
    columnIds: new Set(board.columns.map(column => column.id)),
    cardIds: new Set(allCards.map(card => card.id)),
  });
  const touched = patch.actions.map(action => action.cardId).filter((id): id is string => Boolean(id));
  const cardVersions = Object.fromEntries(allCards.filter(card => touched.includes(card.id)).map(card => [card.id, card.version]));
  const workspaceRow = await prisma.workspace.findUniqueOrThrow({ where: { id: input.workspace.id }, select: { revision: true } });
  const proposal = await prisma.aiProposal.create({
    data: {
      workspaceId: input.workspace.id,
      userId: input.userId,
      source: input.source,
      inputText: input.text,
      summary: patch.summary,
      actions: patch.actions as unknown as Prisma.InputJsonValue,
      clarification: patch.clarification ?? Prisma.DbNull,
      baseRevision: workspaceRow.revision,
      cardVersions,
      model,
      cost: typeof usage?.cost === "number" ? usage.cost : null,
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
    },
  });
  if (input.source === "voice") await markMilestone(prisma, input.workspace.organizationId, "firstVoiceAt");
  await trackEvent("ai_update_proposed");
  return proposalDto(proposal, previewActions(patch.actions, board));
}

export async function getProposal(proposalId: string, workspaceId: string, userId: string) {
  const proposal = await prisma.aiProposal.findFirst({ where: { id: proposalId, workspaceId, userId } });
  if (!proposal) return null;
  const board = await loadBoard(workspaceId);
  return proposalDto(proposal, previewActions(proposal.actions as unknown as AiAction[], board));
}

/**
 * Applies the selected actions of a pending proposal in one transaction. Idempotent: applying an
 * already-applied proposal returns the same receipt. Cards changed since the proposal make it stale.
 */
export async function applyProposal(input: { proposalId: string; workspace: Workspace; userId: string; actionIndexes?: number[] }) {
  const { workspace } = input;
  return prisma.$transaction(async tx => {
    if ((await assertBoardAccess(workspace.id, tx, { userId: input.userId })) === null) throw new BoardAccessError();
    const locked = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "AiProposal" WHERE "id" = ${input.proposalId} AND "workspaceId" = ${workspace.id} AND "userId" = ${input.userId} FOR UPDATE`;
    if (!locked.length) throw new ProposalError("NOT_FOUND");
    const proposal = await tx.aiProposal.findUniqueOrThrow({ where: { id: input.proposalId } });
    if (proposal.status === "APPLIED" && proposal.receipt) return { receipt: proposal.receipt as Record<string, unknown>, replayed: true };
    if (proposal.status !== "PENDING") throw new ProposalError("NOT_FOUND");
    if (proposal.expiresAt < new Date()) {
      await tx.aiProposal.update({ where: { id: proposal.id }, data: { status: "EXPIRED" } });
      throw new ProposalError("PROPOSAL_EXPIRED");
    }
    const allActions = proposal.actions as unknown as AiAction[];
    const actions = selectActions(allActions, input.actionIndexes);
    const versions = proposal.cardVersions as Record<string, number>;
    const touchedIds = actions.map(action => action.cardId).filter((id): id is string => Boolean(id));
    const current = await tx.card.findMany({ where: { id: { in: touchedIds }, workspaceId: workspace.id } });
    if (current.length !== touchedIds.length || current.some(card => card.archived || card.version !== versions[card.id]))
      throw new ProposalError("PROPOSAL_STALE");
    const columns = new Set(
      (await tx.boardColumn.findMany({ where: { workspaceId: workspace.id }, select: { id: true } })).map(column => column.id),
    );
    if (actions.some(action => action.targetColumnId && !columns.has(action.targetColumnId))) throw new ProposalError("PROPOSAL_STALE");
    const byId = new Map(current.map(card => [card.id, card]));
    const batchId = crypto.randomUUID();
    const applied: AiAction[] = [];
    for (const action of actions) {
      if (action.action === "create") {
        const created = await tx.card.create({
          data: {
            workspaceId: workspace.id,
            columnId: action.targetColumnId!,
            title: action.title!,
            description: action.description || "",
            priority: action.priority || "NORMAL",
            dueDate: action.dueDate ? new Date(action.dueDate) : null,
            tags: action.tags || [],
            position: 100000,
          },
        });
        await placeCard(tx, workspace.id, created.columnId, created.id, 0);
        const fresh = await tx.card.findUniqueOrThrow({ where: { id: created.id } });
        await logActivity(tx, {
          organizationId: workspace.organizationId,
          workspaceId: workspace.id,
          userId: input.userId,
          type: "AI_CARD_CREATED",
          entityType: "CARD",
          entityId: created.id,
          batchId,
          afterState: fresh as never,
          undoable: true,
        });
        applied.push(action);
        continue;
      }
      const before = byId.get(action.cardId!)!;
      const data: Prisma.CardUpdateInput = { version: { increment: 1 } };
      if (action.action === "archive") data.archived = true;
      if (action.targetColumnId && action.targetColumnId !== before.columnId) data.column = { connect: { id: action.targetColumnId } };
      if (action.action === "update") {
        if (action.title) data.title = action.title.slice(0, 180);
        if (action.description !== null) data.description = action.description;
        if (action.priority) data.priority = action.priority;
        if (action.dueDate !== null) {
          data.dueDate = action.dueDate ? new Date(action.dueDate) : null;
          data.dueReminderSentAt = null;
        }
        if (action.tags !== null) data.tags = action.tags;
      }
      await tx.card.update({ where: { id: before.id }, data });
      if (data.column) await placeCard(tx, workspace.id, action.targetColumnId!, before.id, 0);
      const after = await tx.card.findUniqueOrThrow({ where: { id: before.id } });
      await logActivity(tx, {
        organizationId: workspace.organizationId,
        workspaceId: workspace.id,
        userId: input.userId,
        type: action.action === "archive" ? "AI_CARD_ARCHIVED" : "AI_CARD_UPDATED",
        entityType: "CARD",
        entityId: before.id,
        batchId,
        beforeState: before as never,
        afterState: { ...after, ...(data.column && { columnChanged: true }) } as never,
        undoable: true,
      });
      applied.push(action);
    }
    const log = await tx.updateLog.create({
      data: {
        workspaceId: workspace.id,
        userId: input.userId,
        source: proposal.source,
        inputText: proposal.inputText,
        summary: proposal.summary,
        actions: applied as unknown as Prisma.InputJsonValue,
        beforeState: { batchId, proposalId: proposal.id },
        model: proposal.model,
        cost: proposal.cost,
      },
    });
    await logActivity(tx, {
      organizationId: workspace.organizationId,
      workspaceId: workspace.id,
      userId: input.userId,
      type: "AI_UPDATE_APPLIED",
      entityType: "UPDATE",
      entityId: log.id,
      batchId,
      afterState: { summary: proposal.summary, actions: applied.length },
    });
    const revision = (await bumpRevision(tx, workspace.id)).revision;
    const receipt = {
      updateId: log.id,
      batchId,
      applied: applied.length,
      skipped: allActions.length - applied.length,
      revision,
      appliedAt: new Date().toISOString(),
    };
    await tx.aiProposal.update({
      where: { id: proposal.id },
      data: { status: "APPLIED", appliedAt: new Date(), updateLogId: log.id, receipt },
    });
    await markMilestone(tx, workspace.organizationId, "firstAiUpdateAt");
    return { receipt, replayed: false };
  });
}

export async function discardProposal(input: { proposalId: string; workspaceId: string; userId: string }) {
  const updated = await prisma.aiProposal.updateMany({
    where: { id: input.proposalId, workspaceId: input.workspaceId, userId: input.userId, status: "PENDING" },
    data: { status: "DISCARDED" },
  });
  if (updated.count) await trackEvent("ai_update_discarded");
  return updated.count > 0;
}

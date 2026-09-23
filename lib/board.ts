import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { organizationReadOnly } from "@/lib/plans";
import { queueProjectPush } from "@/lib/push";
import { queueWebhookEvent } from "@/lib/webhooks";

export const WRITER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export const MANAGER_ROLES = ["OWNER", "ADMIN"] as const;
export const ALL_ROLES = ["OWNER", "ADMIN", "MEMBER", "GUEST"] as const;

export function canWriteCards(role?: string | null) {
  return (WRITER_ROLES as readonly string[]).includes(role || "");
}

export function canManageRole(role?: string | null) {
  return (MANAGER_ROLES as readonly string[]).includes(role || "");
}

export async function workspaceForUser(slug: string, userId: string) {
  return prisma.workspace.findFirst({
    where: { slug, members: { some: { userId } } },
    include: { organization: true, members: { where: { userId }, select: { role: true } } },
  });
}

export function workspaceReadOnly(workspace: {
  lifecycleStatus?: string;
  organization: { readOnlyAt: Date | null; plan: string; trialEndsAt: Date | null; accessExpiresAt: Date | null; lifecycleStatus?: string };
}) {
  return (
    (workspace.lifecycleStatus !== undefined && workspace.lifecycleStatus !== "ACTIVE") ||
    (workspace.organization.lifecycleStatus !== undefined && workspace.organization.lifecycleStatus !== "ACTIVE") ||
    organizationReadOnly(workspace.organization)
  );
}

type Actor = { userId: string; manageColumns?: boolean; allowGuest?: boolean };

/** Must run inside the same transaction as the writes.
 * The workspace row lock serializes board writers; shared locks on the access rows order membership
 * revocation, account suspension and organization changes with commit. Returns the current revision,
 * or null when the actor may not write. Never use the root Prisma client: autocommit would release the locks.
 */
export async function assertBoardAccess(workspaceId: string, tx: Prisma.TransactionClient, actor: Actor) {
  const roles: readonly string[] = actor.manageColumns ? MANAGER_ROLES : actor.allowGuest ? ALL_ROLES : WRITER_ROLES;
  const rows = await tx.$queryRaw<
    Array<{
      revision: number;
      plan: string;
      trialEndsAt: Date | null;
      accessExpiresAt: Date | null;
      readOnlyAt: Date | null;
    }>
  >(Prisma.sql`
    SELECT w."revision", o."plan", o."trialEndsAt", o."accessExpiresAt", o."readOnlyAt"
    FROM "Workspace" w
    JOIN "WorkspaceMember" m ON m."workspaceId" = w."id"
    JOIN "User" u ON u."id" = m."userId"
    JOIN "Organization" o ON o."id" = w."organizationId"
    WHERE w."id" = ${workspaceId} AND m."userId" = ${actor.userId}
      AND m."role" IN (${Prisma.join([...roles])})
      AND u."lifecycleStatus" = 'ACTIVE'
      AND w."lifecycleStatus" = 'ACTIVE' AND o."lifecycleStatus" = 'ACTIVE'
    FOR UPDATE OF w FOR SHARE OF m, u, o
  `);
  const current = rows[0];
  if (!current || organizationReadOnly(current)) return null;
  return current.revision;
}

/** Board-level optimistic check, kept for batch operations (AI undo) that touch many cards at once. */
export async function assertRevision(workspaceId: string, revision: unknown, tx: Prisma.TransactionClient, actor: Actor) {
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) return false;
  const current = await assertBoardAccess(workspaceId, tx, actor);
  return current !== null && current === revision;
}

export class BoardAccessError extends Error {
  constructor() {
    super("STALE_REVISION");
  }
}

export class CardConflictError extends Error {
  constructor(public readonly cardId: string) {
    super("CARD_CONFLICT");
  }
}

export function isBoardConflict(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.message === "STALE_REVISION") return true;
  // PostgreSQL may abort a deadlock with a concurrent lifecycle operation.
  const databaseError = error as Error & { code?: string; meta?: { code?: string } };
  return databaseError.code === "P2034" || (databaseError.code === "P2010" && ["40P01", "40001"].includes(databaseError.meta?.code || ""));
}

type ActivityInput = {
  organizationId: string;
  workspaceId: string;
  userId: string;
  type: string;
  entityType: string;
  entityId?: string;
  beforeState?: Prisma.InputJsonValue;
  afterState?: Prisma.InputJsonValue;
  batchId?: string;
  undoable?: boolean;
};

export async function logActivity(tx: Prisma.TransactionClient, input: ActivityInput) {
  const event = await tx.activityEvent.create({ data: input });
  await queueProjectPush(tx, event);
  await queueWebhookEvent(tx, input.workspaceId, input.type, {
    id: event.id,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    actorId: input.userId,
    batchId: input.batchId ?? null,
    after: input.afterState ?? null,
    createdAt: event.createdAt.toISOString(),
  });
  return event;
}

export async function bumpRevision(tx: Prisma.TransactionClient, workspaceId: string) {
  return tx.workspace.update({ where: { id: workspaceId }, data: { revision: { increment: 1 } }, select: { revision: true } });
}

/**
 * Per-card optimistic concurrency: the write succeeds only if the card still has the version the client saw.
 * Two people editing different cards never conflict; the same card conflicts explicitly.
 */
export async function claimCardVersion(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  cardId: string,
  expectedVersion: number | undefined,
) {
  if (expectedVersion === undefined) return;
  const claimed = await tx.card.updateMany({
    where: { id: cardId, workspaceId, version: expectedVersion },
    data: { version: { increment: 1 } },
  });
  if (!claimed.count) throw new CardConflictError(cardId);
}

type Milestone = "firstBoardAt" | "firstAiUpdateAt" | "firstVoiceAt" | "firstInviteAt" | "firstCardMovedAt";

/** Activation milestones (organization metadata only, no content): used by the onboarding checklist and KPIs. */
export async function markMilestone(client: Prisma.TransactionClient | typeof prisma, organizationId: string, milestone: Milestone) {
  await client.organization.updateMany({ where: { id: organizationId, [milestone]: null }, data: { [milestone]: new Date() } });
}

export const cardInclude = {
  assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
  _count: { select: { comments: { where: { deletedAt: null } } } },
} satisfies Prisma.CardInclude;

export function orderWithCard(ids: string[], cardId: string, index?: number) {
  const others = ids.filter(id => id !== cardId);
  const target = index === undefined ? others.length : Math.max(0, Math.min(Math.floor(index), others.length));
  return [...others.slice(0, target), cardId, ...others.slice(target)];
}

/**
 * Renumbers a column so positions stay dense after inserts and moves. Raw SQL on purpose: reordering
 * neighbours must not touch their version/updatedAt, otherwise unrelated edits and undos would conflict.
 */
export async function placeCard(tx: Prisma.TransactionClient, workspaceId: string, columnId: string, cardId: string, index?: number) {
  const cards = await tx.card.findMany({
    where: { workspaceId, columnId, archived: false },
    orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
    select: { id: true },
  });
  const ordered = orderWithCard(
    cards.map(card => card.id),
    cardId,
    index,
  );
  await tx.$executeRaw`
    UPDATE "Card" AS c SET "position" = v.pos
    FROM (SELECT id, ord - 1 AS pos FROM unnest(${ordered}::text[]) WITH ORDINALITY AS t(id, ord)) AS v
    WHERE c."id" = v.id AND c."workspaceId" = ${workspaceId}`;
}

/** A card is untouched since an AI change if its version (or, for older logs, its timestamp) still matches. */
export function unchangedSince(current: { version: number; updatedAt: Date }, after: Record<string, unknown>) {
  if (typeof after.version === "number") return current.version === after.version;
  return Boolean(after.updatedAt) && current.updatedAt.toISOString() === new Date(String(after.updatedAt)).toISOString();
}

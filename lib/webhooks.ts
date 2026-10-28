import { createHmac, randomBytes } from "node:crypto";
import { assertSafeWebhookUrl, postSafeWebhook } from "@/lib/safe-webhook";
export { assertSafeWebhookUrl } from "@/lib/safe-webhook";
import { Prisma } from "@prisma/client";
import { appUrl } from "@/lib/email";
import { prisma } from "@/lib/prisma";

/** Events a webhook can subscribe to. Activity types are grouped into public, stable names. */
export const WEBHOOK_EVENTS = [
  "card.created",
  "card.updated",
  "card.moved",
  "card.archived",
  "comment.created",
  "ai.update.applied",
  "ai.update.undone",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function publicEventName(activityType: string, after?: unknown): WebhookEvent | null {
  switch (activityType) {
    case "CARD_CREATED":
    case "AI_CARD_CREATED":
    case "CARD_IMPORTED":
      return "card.created";
    case "CARD_MOVED":
      return "card.moved";
    case "CARD_ARCHIVED":
    case "AI_CARD_ARCHIVED":
      return "card.archived";
    case "CARD_UPDATED":
    case "CARD_RESTORED":
    case "AI_CARD_UPDATED":
      return after && typeof after === "object" && "columnChanged" in after ? "card.moved" : "card.updated";
    case "COMMENT_CREATED":
      return "comment.created";
    case "AI_UPDATE_APPLIED":
      return "ai.update.applied";
    case "AI_UPDATE_UNDONE":
      return "ai.update.undone";
    default:
      return null;
  }
}

export function newWebhookSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signPayload(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Queued inside the board transaction: a rollback also drops the delivery. No network here. */
export async function queueWebhookEvent(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  activityType: string,
  payload: Record<string, unknown>,
) {
  const event = publicEventName(activityType, payload.after);
  if (!event) return;
  const hooks = await tx.webhook.findMany({ where: { workspaceId, active: true }, select: { id: true, events: true } });
  const targets = hooks.filter(
    hook => Array.isArray(hook.events) && (hook.events.length === 0 || (hook.events as string[]).includes(event)),
  );
  if (!targets.length) return;
  await tx.webhookDelivery.createMany({
    data: targets.map(hook => ({
      webhookId: hook.id,
      eventType: event,
      payload: { event, workspaceId, data: payload } as Prisma.InputJsonValue,
    })),
  });
}

const SLACK_COPY = {
  it: {
    "card.created": "Nuova card",
    "card.updated": "Card aggiornata",
    "card.moved": "Card spostata",
    "card.archived": "Card archiviata",
    "comment.created": "Nuovo commento",
    "ai.update.applied": "Aggiornamento AI applicato",
    "ai.update.undone": "Aggiornamento AI annullato",
    card: "Apri card",
  },
  en: {
    "card.created": "New card",
    "card.updated": "Card updated",
    "card.moved": "Card moved",
    "card.archived": "Card archived",
    "comment.created": "New comment",
    "ai.update.applied": "AI update applied",
    "ai.update.undone": "AI update undone",
    card: "Open card",
  },
} as const;

/** Slack mrkdwn control characters; user text must never form links or mentions. */
export function escapeSlack(value: string) {
  return value.replace(/[&<>]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!);
}

/** Incoming-webhook body: localized by board locale (it, otherwise en), linking the board and the card. */
export function slackMessage(
  eventType: string,
  payload: Record<string, unknown>,
  workspace: { slug: string; name: string; locale: string },
  appOrigin: string,
) {
  const copy = SLACK_COPY[workspace.locale === "it" ? "it" : "en"];
  const data = (payload.data || {}) as Record<string, unknown>;
  const after = (data.after || {}) as Record<string, unknown>;
  const board = `${appOrigin}/app/${encodeURIComponent(workspace.slug)}`;
  const label = copy[eventType as keyof typeof copy] || escapeSlack(eventType);
  const cardId = data.entityType === "CARD" && typeof data.entityId === "string" ? data.entityId : null;
  const title = typeof after.title === "string" && after.title.trim() ? `“${escapeSlack(after.title.trim().slice(0, 200))}”` : copy.card;
  const card = cardId ? `: <${board}?card=${encodeURIComponent(cardId)}|${title}>` : "";
  return { text: `BoardCue · ${label}${card} · <${board}|${escapeSlack(workspace.name)}>` };
}

/** Bounded, leased outbox (same pattern as push). Retries with backoff, max 5 attempts. */
export async function dispatchWebhooks(limit = 25) {
  const now = new Date();
  const jobs = await prisma.webhookDelivery.findMany({
    where: { deliveredAt: null, attempts: { lt: 5 }, availableAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    orderBy: { createdAt: "asc" },
    take: Math.min(100, Math.max(1, limit)),
    include: { webhook: { include: { workspace: { select: { slug: true, name: true, locale: true } } } } },
  });
  const origin = new URL(appUrl("/")).origin;
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    const claimed = await prisma.webhookDelivery.updateMany({
      where: { id: job.id, deliveredAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
      data: { leaseUntil: new Date(Date.now() + 30_000), attempts: { increment: 1 } },
    });
    if (!claimed.count || !job.webhook.active) continue;
    const payload = job.payload as Record<string, unknown>;
    const body = JSON.stringify(
      job.webhook.format === "slack" ? slackMessage(job.eventType, payload, job.webhook.workspace, origin) : payload,
    );
    const timestamp = Math.floor(Date.now() / 1000);
    try {
      const response = await postSafeWebhook(job.webhook.url, {
          "Content-Type": "application/json",
          "User-Agent": "BoardCue-Webhooks/1",
          "X-BoardCue-Event": job.eventType,
          "X-BoardCue-Delivery": job.id,
          "X-BoardCue-Signature": `t=${timestamp},v1=${signPayload(job.webhook.secret, timestamp, body)}`,
      }, body);
      await prisma.webhook.update({
        where: { id: job.webhookId },
        data: { lastStatus: response.status, lastError: response.ok ? null : `HTTP ${response.status}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await prisma.webhookDelivery.update({ where: { id: job.id }, data: { deliveredAt: new Date(), leaseUntil: null, lastError: null } });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 200) : "error";
      await prisma.webhookDelivery.update({
        where: { id: job.id },
        data: { leaseUntil: null, lastError: message, availableAt: new Date(Date.now() + 60_000 * 2 ** job.attempts) },
      });
      failed += 1;
    }
  }
  await prisma.webhookDelivery.deleteMany({
    where: {
      OR: [
        { deliveredAt: { lt: new Date(Date.now() - 7 * 86400000) } },
        { attempts: { gte: 5 }, createdAt: { lt: new Date(Date.now() - 7 * 86400000) } },
      ],
    },
  });
  return { sent, failed };
}

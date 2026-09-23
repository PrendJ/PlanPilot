import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { Prisma } from "@prisma/client";
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

function privateAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const value = address.toLowerCase();
  return (
    value === "::1" ||
    value === "::" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe80") ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.")
  );
}

/** Blocks SSRF: HTTPS only, public hostnames resolving to public addresses. */
export async function assertSafeWebhookUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("INVALID_URL");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("INVALID_URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || (net.isIP(host) && privateAddress(host)))
    throw new Error("INVALID_URL");
  const records = await lookup(host, { all: true }).catch(() => []);
  if (!records.length || records.some(record => privateAddress(record.address))) throw new Error("INVALID_URL");
  return url;
}

function slackText(eventType: string, payload: Record<string, unknown>) {
  const data = (payload.data || {}) as Record<string, unknown>;
  const after = (data.after || {}) as Record<string, unknown>;
  const title = typeof after.title === "string" ? `“${after.title}”` : "";
  const labels: Record<string, string> = {
    "card.created": "Nuova card",
    "card.updated": "Card aggiornata",
    "card.moved": "Card spostata",
    "card.archived": "Card archiviata",
    "comment.created": "Nuovo commento",
    "ai.update.applied": "Aggiornamento AI applicato",
    "ai.update.undone": "Aggiornamento AI annullato",
  };
  return `BoardCue · ${labels[eventType] || eventType} ${title}`.trim();
}

/** Bounded, leased outbox (same pattern as push). Retries with backoff, max 5 attempts. */
export async function dispatchWebhooks(limit = 25) {
  const now = new Date();
  const jobs = await prisma.webhookDelivery.findMany({
    where: { deliveredAt: null, attempts: { lt: 5 }, availableAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    orderBy: { createdAt: "asc" },
    take: Math.min(100, Math.max(1, limit)),
    include: { webhook: true },
  });
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    const claimed = await prisma.webhookDelivery.updateMany({
      where: { id: job.id, deliveredAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
      data: { leaseUntil: new Date(Date.now() + 30_000), attempts: { increment: 1 } },
    });
    if (!claimed.count || !job.webhook.active) continue;
    const payload = job.payload as Record<string, unknown>;
    const body = JSON.stringify(job.webhook.format === "slack" ? { text: slackText(job.eventType, payload) } : payload);
    const timestamp = Math.floor(Date.now() / 1000);
    try {
      await assertSafeWebhookUrl(job.webhook.url);
      const response = await fetch(job.webhook.url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "BoardCue-Webhooks/1",
          "X-BoardCue-Event": job.eventType,
          "X-BoardCue-Delivery": job.id,
          "X-BoardCue-Signature": `t=${timestamp},v1=${signPayload(job.webhook.secret, timestamp, body)}`,
        },
        body,
      });
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

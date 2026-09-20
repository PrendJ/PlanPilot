import { randomUUID, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { allowedPushEndpoint, pushConfig } from "@/lib/push-config";

/** Queue within the board transaction: rollback also removes notifications. No network here. */
export async function queueProjectPush(tx: Prisma.TransactionClient, event: { id: string; workspaceId: string | null; userId: string; batchId: string | null }) {
  if (!pushConfig() || !event.workspaceId) return;
  const subscriptions = await tx.pushSubscription.findMany({
    where: { session: { expiresAt: { gt: new Date() }, user: {
      id: { not: event.userId }, lifecycleStatus: "ACTIVE", emailVerifiedAt: { not: null },
      memberships: { some: { workspaceId: event.workspaceId } },
    } } }, select: { id: true },
  });
  const queuedAt = new Date();
  if (subscriptions.length) await tx.pushDelivery.createMany({
    data: subscriptions.map(s => ({ subscriptionId: s.id, eventId: event.id, dedupKey: event.batchId || event.id, createdAt: queuedAt, availableAt: queuedAt })), skipDuplicates: true,
  });
}

/** Bounded, leased outbox. Transport may retry after a lost acknowledgement; tag/topic coalesce it. */
export async function dispatchProjectPush(limit = 20) {
  const config = pushConfig();
  if (!config) return { enabled: false, sent: 0, discarded: 0, retried: 0 };
  const result = { enabled: true, sent: 0, discarded: 0, retried: 0 };
  const now = new Date();
  // Only new infrastructure records are cleaned here; project/audit retention is unchanged.
  await prisma.pushSubscription.deleteMany({ where: { session: { expiresAt: { lte: now } } } });
  await prisma.pushDelivery.deleteMany({ where: { OR: [{ createdAt: { lt: new Date(+now - 86400000) } }, { attempts: { gte: 3 }, leaseUntil: { lt: now } }] } });
  const jobs = await prisma.pushDelivery.findMany({ where: { availableAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, orderBy: { createdAt: "asc" }, take: Math.min(50, Math.max(1, limit)), select: { id: true } });
  for (const job of jobs) {
    const leaseToken = randomUUID();
    const claimed = await prisma.pushDelivery.updateMany({ where: { id: job.id, availableAt: { lte: new Date() }, attempts: { lt: 3 }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseToken, leaseUntil: new Date(Date.now() + 30000), attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    try {
      const sent = await prisma.$transaction(async tx => {
        // Lock the current subscription and access rows through dispatch, ordering revocation/logout
        // with delivery. Network is bounded to 3s; never hold a board write lock here.
        const rows = await tx.$queryRaw<Array<{ endpoint: string; p256dh: string; auth: string; dedupKey: string }>>(Prisma.sql`
          SELECT p."endpoint", p."p256dh", p."auth", d."dedupKey"
          FROM "PushDelivery" d JOIN "PushSubscription" p ON p."id" = d."subscriptionId"
          JOIN "Session" s ON s."id" = p."sessionId" JOIN "User" u ON u."id" = s."userId"
          JOIN "ActivityEvent" e ON e."id" = d."eventId"
          JOIN "Workspace" w ON w."id" = e."workspaceId"
          JOIN "Organization" o ON o."id" = w."organizationId"
          JOIN "WorkspaceMember" m ON m."workspaceId" = w."id" AND m."userId" = u."id"
          WHERE d."id" = ${job.id} AND d."leaseToken" = ${leaseToken}
            AND s."expiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND u."emailVerifiedAt" IS NOT NULL
            AND u."lifecycleStatus" = 'ACTIVE' AND w."lifecycleStatus" = 'ACTIVE'
            AND o."lifecycleStatus" = 'ACTIVE' AND u."id" <> e."userId"
            AND m."role" IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')
          FOR SHARE OF p, s, u, w, o, m
        `);
        const subscription = rows[0];
        if (!subscription || !allowedPushEndpoint(subscription.endpoint)) return false;
        const tag = createHash("sha256").update(subscription.dedupKey).digest("base64url").slice(0, 32);
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ tag }), {
          vapidDetails: config, timeout: 3000, TTL: 3600, urgency: "normal", topic: tag,
        });
        return true;
      }, { timeout: 8000, maxWait: 2000 });
      await prisma.pushDelivery.deleteMany({ where: { id: job.id, leaseToken } });
      if (sent) result.sent++; else result.discarded++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      const jobState = await prisma.pushDelivery.findFirst({ where: { id: job.id, leaseToken }, select: { attempts: true, subscriptionId: true } });
      if (!jobState) continue;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.deleteMany({ where: { id: jobState.subscriptionId } }); result.discarded++;
      } else if (jobState.attempts >= 3) {
        await prisma.pushDelivery.deleteMany({ where: { id: job.id, leaseToken } }); result.discarded++;
      } else {
        await prisma.pushDelivery.updateMany({ where: { id: job.id, leaseToken }, data: { leaseToken: null, leaseUntil: null, availableAt: new Date(Date.now() + 60000 * jobState.attempts) } }); result.retried++;
      }
      // Do not log endpoints, keys, provider bodies, project names or user content.
    }
  }
  return result;
}

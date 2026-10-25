import { prisma } from "@/lib/prisma";
import { historyRetention } from "@/lib/plans";

const BATCH = 5000;

/** Deletes in batches so the hourly job never holds long locks on busy tables. */
async function deleteInBatches(find: () => Promise<Array<{ id: string }>>, remove: (ids: string[]) => Promise<{ count: number }>) {
  let total = 0;
  for (;;) {
    const ids = (await find()).map(row => row.id);
    if (!ids.length) return total;
    total += (await remove(ids)).count;
    if (ids.length < BATCH) return total;
  }
}

/**
 * Change history older than the organization's plan allows (6 months on base plans, 24 on the others) is deleted
 * entirely: activity events (with their push deliveries), AI update logs and AI proposals. Boards, cards, comments
 * and billing usage are not history and are kept. Owner decision of 2026-10-25.
 */
export async function pruneHistory(now = new Date()) {
  let activityEvents = 0;
  let updateLogs = 0;
  let aiProposals = 0;
  for (const { plans, cutoff } of historyRetention(now)) {
    const organization = { plan: { in: plans } };
    activityEvents += await deleteInBatches(
      () => prisma.activityEvent.findMany({ where: { createdAt: { lt: cutoff }, organization }, select: { id: true }, take: BATCH }),
      ids => prisma.activityEvent.deleteMany({ where: { id: { in: ids } } }),
    );
    updateLogs += await deleteInBatches(
      () => prisma.updateLog.findMany({ where: { createdAt: { lt: cutoff }, workspace: { organization } }, select: { id: true }, take: BATCH }),
      ids => prisma.updateLog.deleteMany({ where: { id: { in: ids } } }),
    );
    aiProposals += await deleteInBatches(
      () => prisma.aiProposal.findMany({ where: { createdAt: { lt: cutoff }, workspace: { organization } }, select: { id: true }, take: BATCH }),
      ids => prisma.aiProposal.deleteMany({ where: { id: { in: ids } } }),
    );
  }
  return { prunedActivityEvents: activityEvents, prunedUpdateLogs: updateLogs, prunedAiProposals: aiProposals };
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  activityEvent: { findMany: vi.fn(), deleteMany: vi.fn() },
  updateLog: { findMany: vi.fn(), deleteMany: vi.fn() },
  aiProposal: { findMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const { pruneHistory } = await import("@/lib/history-retention");

beforeEach(() => {
  vi.resetAllMocks();
  for (const table of Object.values(db)) {
    table.findMany.mockResolvedValue([]);
    table.deleteMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }));
  }
});

describe("change history retention", () => {
  it("deletes whole history older than 6 months on base plans and 24 months on the others", async () => {
    db.activityEvent.findMany.mockResolvedValueOnce([{ id: "old-event" }]);
    db.updateLog.findMany.mockResolvedValueOnce([{ id: "old-log" }]);
    const result = await pruneHistory(new Date("2026-10-25T03:00:00Z"));
    expect(result).toEqual({ prunedActivityEvents: 1, prunedUpdateLogs: 1, prunedAiProposals: 0 });
    const filters = db.activityEvent.findMany.mock.calls.map(([args]) => args.where);
    expect(filters).toContainEqual({
      createdAt: { lt: new Date("2026-04-25T03:00:00Z") },
      organization: { plan: { in: ["TRIAL", "PERSONAL_PRO", "PRO", "SOLO"] } },
    });
    expect(filters).toContainEqual(expect.objectContaining({ createdAt: { lt: new Date("2024-10-25T03:00:00Z") } }));
    expect(db.updateLog.findMany.mock.calls[0][0].where).toMatchObject({ workspace: { organization: { plan: { in: expect.any(Array) } } } });
    expect(db.activityEvent.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["old-event"] } } });
  });
  it("keeps deleting in batches until nothing older is left", async () => {
    const full = Array.from({ length: 5000 }, (_, index) => ({ id: `e${index}` }));
    db.activityEvent.findMany.mockResolvedValueOnce(full).mockResolvedValueOnce([{ id: "last" }]);
    expect((await pruneHistory()).prunedActivityEvents).toBe(5001);
    expect(db.activityEvent.deleteMany).toHaveBeenCalledTimes(2);
  });
});

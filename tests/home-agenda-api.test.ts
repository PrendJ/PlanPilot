import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), twoFactor: vi.fn(), cards: vi.fn(), columns: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getApiUser: mocks.user, twoFactorRequiredButMissing: mocks.twoFactor }));
vi.mock("@/lib/prisma", () => ({ prisma: { card: { findMany: mocks.cards }, boardColumn: { findMany: mocks.columns } } }));

import { GET } from "@/app/api/home/today/route";

const columns = [
  { id: "todo", title: "To do", semanticKey: "READY", position: 0, workspaceId: "work" },
  { id: "done", title: "Done", semanticKey: "DONE", position: 1, workspaceId: "work" },
];
const card = (id: string, column = columns[0]) => ({
  id,
  title: id,
  dueDate: new Date("2026-10-28T12:00:00Z"),
  priority: "NORMAL",
  column,
  workspace: { id: "work", name: "Work", slug: "work" },
});
const request = () => new Request("http://localhost/api/home/today?date=2026-10-28");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "me" });
  mocks.twoFactor.mockResolvedValue(false);
  mocks.columns.mockResolvedValue(columns);
});

describe("home agenda API", () => {
  it("returns every open task beyond the previous limits and preserves card links and completion targets", async () => {
    mocks.cards
      .mockResolvedValueOnce([...Array.from({ length: 350 }, (_, i) => card(`task-${i}`)), card("finished", columns[1])])
      .mockResolvedValueOnce([]);
    const response = await GET(request());
    const body = await response.json();
    expect(body.cards).toHaveLength(350);
    expect(body.cards[349]).toMatchObject({ id: "task-349", slug: "work", doneColumnId: "done" });
    const query = mocks.cards.mock.calls[0][0];
    expect(query.take).toBeUndefined();
    expect(query.where).toMatchObject({
      archived: false,
      workspace: { lifecycleStatus: "ACTIVE", members: { some: { userId: "me" } } },
      OR: [{ assignees: { none: {} } }, { assignees: { some: { userId: "me" } } }],
    });
    // Includes the seventh upcoming day even at the most negative UTC offset.
    expect(query.where.dueDate.lt.toISOString()).toBe("2026-11-05T14:00:00.000Z");
  });

  it("rejects unauthenticated requests without reading cards", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.cards).not.toHaveBeenCalled();
  });
});

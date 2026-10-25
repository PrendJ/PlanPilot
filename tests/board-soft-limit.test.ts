import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { adminAuditEvent: { findFirst: vi.fn(), create: vi.fn() }, user: { findMany: vi.fn() } },
  send: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/email", () => ({
  appUrl: (path: string) => `https://boardcue.test${path}`,
  escapeHtml: (value: string) => value,
  renderEmail: (input: { paragraphs: string[] }) => input.paragraphs.join(" "),
  sendEmail: mocks.send,
}));
const { BOARD_SOFT_LIMIT_ACTION, notifyBoardSoftLimit } = await import("@/lib/board-soft-limit");

const input = { organization: { id: "org", name: "Acme", plan: "BUSINESS" }, userId: "user", activeBoards: 401, softLimit: 400 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.adminAuditEvent.findFirst.mockResolvedValue(null);
  mocks.db.user.findMany.mockResolvedValue([{ email: "owner@boardcue.test" }, { email: "ops@boardcue.test" }]);
  mocks.send.mockResolvedValue({});
});

describe("Business board soft cap", () => {
  it("records an audit entry and emails every BoardCue superadmin when the soft cap is crossed", async () => {
    expect(await notifyBoardSoftLimit(input)).toBe(true);
    expect(mocks.db.adminAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: BOARD_SOFT_LIMIT_ACTION, targetType: "organization", targetId: "org", actorId: "user" }),
    });
    expect(mocks.send.mock.calls.map(([mail]) => mail.to)).toEqual(["owner@boardcue.test", "ops@boardcue.test"]);
    expect(mocks.send.mock.calls[0][0].html).toContain("401");
  });
  it("stays silent under the cap and when admins were already told in the last 30 days", async () => {
    expect(await notifyBoardSoftLimit({ ...input, activeBoards: 400 })).toBe(false);
    mocks.db.adminAuditEvent.findFirst.mockResolvedValue({ id: "earlier" });
    expect(await notifyBoardSoftLimit(input)).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.db.adminAuditEvent.create).not.toHaveBeenCalled();
  });
  it("never throws, so creating the board is not affected by a failed alert", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.db.adminAuditEvent.create.mockRejectedValue(new Error("db down"));
    await expect(notifyBoardSoftLimit(input)).resolves.toBe(false);
  });
});

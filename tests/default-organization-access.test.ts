import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  organization: { findFirst: vi.fn(), findMany: vi.fn() },
  organizationMember: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/workspace", () => ({ createOrganization: vi.fn() }));
import { ensureDefaultOrganization, ensureActiveOrganization } from "@/lib/default-organization";

describe("selected organization access", () => {
  beforeEach(() => vi.clearAllMocks());
  it("preserves an existing shared membership without granting owner rights", async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({ activeOrganizationId: "shared" });
    db.organization.findFirst.mockResolvedValue({ id: "shared" });
    expect(await ensureActiveOrganization("u")).toEqual({ id: "shared" });
    expect(db.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ members: { some: { userId: "u" } } }) }),
    );
    expect(db.organizationMember.upsert).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("falls back to an owned organization when access to the selected one was removed", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u", name: "User", locale: "it", defaultOrganizationId: "lost" });
    db.organization.findFirst.mockResolvedValue(null);
    db.organization.findMany.mockResolvedValue([{ id: "owned" }]);
    db.$transaction.mockResolvedValue([]);
    expect(await ensureDefaultOrganization("u")).toEqual({ id: "owned" });
    expect(db.organizationMember.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
  });
});

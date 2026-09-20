import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { assertRevision, isBoardConflict } from "@/lib/board";

const active = { revision: 5, plan: "TEAM", trialEndsAt: null, accessExpiresAt: null, readOnlyAt: null };
function transaction(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue(rows);
  return { query, tx: { $queryRaw: query } as unknown as Prisma.TransactionClient };
}

describe("board write gate (SQL contract; not a PostgreSQL concurrency test)", () => {
  it("locks the board and access rows inside the supplied transaction using bound IDs", async () => {
    const { query, tx } = transaction([active]);
    expect(await assertRevision("workspace-a", 5, tx, { userId: "user-a" })).toBe(true);
    const sql = query.mock.calls[0][0] as Prisma.Sql;
    expect(sql.text).toContain("FOR UPDATE OF w FOR SHARE OF m, u, o");
    expect(sql.text).toContain('m."userId" =');
    expect(sql.text).toContain('m."workspaceId" = w."id"');
    expect(sql.text).toContain('o."id" = w."organizationId"');
    for (const alias of ["w", "u", "o"]) expect(sql.text).toContain(`${alias}."lifecycleStatus" = 'ACTIVE'`);
    expect(sql.text).toContain('u."emailVerifiedAt" IS NOT NULL');
    expect(sql.values).toEqual(["workspace-a", "user-a", "OWNER", "ADMIN", "MEMBER"]);
    expect(sql.text).not.toContain("user-a");
  });
  it("requires a current manager role for column actions", async () => {
    const { query, tx } = transaction([active]);
    await assertRevision("workspace-a", 5, tx, { userId: "user-a", manageColumns: true });
    expect(query.mock.calls[0][0].values).toEqual(["workspace-a", "user-a", "OWNER", "ADMIN"]);
  });
  it.each([undefined, null, "5", -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid revision %s without querying", async revision => {
    const { query, tx } = transaction([active]);
    expect(await assertRevision("workspace-a", revision, tx, { userId: "user-a" })).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
  it.each([
    [], [{ ...active, revision: 6 }], [{ ...active, readOnlyAt: new Date(0) }],
    [{ ...active, accessExpiresAt: new Date(0) }], [{ ...active, plan: "TRIAL", trialEndsAt: new Date(0) }],
  ].map(rows => ({ rows })))("denies missing access, stale or expired state %#", async ({ rows }) => {
    expect(await assertRevision("workspace-a", 5, transaction(rows).tx, { userId: "user-a" })).toBe(false);
  });
  it("maps serialization/deadlock aborts to a retryable conflict, not success", () => {
    expect(isBoardConflict(Object.assign(new Error("aborted"), { code: "P2034" }))).toBe(true);
    expect(isBoardConflict(Object.assign(new Error("aborted"), { code: "P2010", meta: { code: "40P01" } }))).toBe(true);
    expect(isBoardConflict(new Error("unrelated"))).toBe(false);
  });
});

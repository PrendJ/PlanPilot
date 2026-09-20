import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { assertRevision, bumpRevision } from "@/lib/board";

// Opt in only with a disposable, migrated LOCAL database. Never use DATABASE_URL.
const testUrl = process.env.BOARDCUE_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !/^\/boardcue_test_[a-zA-Z0-9_]+$/.test(url.pathname)
    || url.searchParams.has("host")) {
    throw new Error("PostgreSQL tests require a loopback host and a disposable boardcue_test_* database");
  }
}

describe.skipIf(!testUrl)("PostgreSQL board transaction gate (explicit local fixture database)", () => {
  let db: PrismaClient;
  let userId: string;
  let foreignUserId: string;
  let orgId: string;
  let workspaceId: string;
  let columnId: string;
  let cardId: string;
  const marker = crypto.randomUUID();

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: testUrl });
    const fixture = await db.$transaction(async tx => {
      const user = await tx.user.create({ data: { name: "Synthetic member", email: `${marker}@example.invalid`, passwordHash: "TEST_ONLY", emailVerifiedAt: new Date() } });
      const foreign = await tx.user.create({ data: { name: "Synthetic outsider", email: `foreign-${marker}@example.invalid`, passwordHash: "TEST_ONLY", emailVerifiedAt: new Date() } });
      const organization = await tx.organization.create({ data: { name: "Synthetic organization", slug: `test-${marker}`, createdById: user.id, plan: "TEAM", members: { create: { userId: user.id, role: "OWNER" } } } });
      const workspace = await tx.workspace.create({ data: { name: "Synthetic workspace", slug: `test-${marker}`, organizationId: organization.id, createdById: user.id, revision: 5, members: { create: { userId: user.id, role: "OWNER" } } } });
      const column = await tx.boardColumn.create({ data: { workspaceId: workspace.id, title: "Da fare", position: 0 } });
      const card = await tx.card.create({ data: { workspaceId: workspace.id, columnId: column.id, title: "Before" } });
      return { user, foreign, organization, workspace, column, card };
    });
    userId = fixture.user.id; foreignUserId = fixture.foreign.id; orgId = fixture.organization.id;
    workspaceId = fixture.workspace.id; columnId = fixture.column.id; cardId = fixture.card.id;
  });
  beforeEach(async () => {
    await db.user.update({ where: { id: userId }, data: { lifecycleStatus: "ACTIVE" } });
    await db.organization.update({ where: { id: orgId }, data: { lifecycleStatus: "ACTIVE", readOnlyAt: null } });
    await db.workspace.update({ where: { id: workspaceId }, data: { revision: 5, lifecycleStatus: "ACTIVE" } });
    await db.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId, userId } }, create: { workspaceId, userId, role: "OWNER" }, update: { role: "OWNER" } });
    await db.card.update({ where: { id: cardId }, data: { title: "Before" } });
  });
  afterAll(async () => {
    if (!db) return;
    // Delete only the fixture organization and accounts created by this test run.
    try {
      if (orgId) await db.organization.delete({ where: { id: orgId } });
      if (userId) await db.user.delete({ where: { id: userId } });
      if (foreignUserId) await db.user.delete({ where: { id: foreignUserId } });
    } finally { await db.$disconnect(); }
  });

  it("permits an authorized write and advances the revision once", async () => {
    await db.$transaction(async tx => {
      expect(await assertRevision(workspaceId, 5, tx, { userId })).toBe(true);
      await tx.card.update({ where: { id: cardId }, data: { title: "After" } });
      expect((await bumpRevision(tx, workspaceId)).revision).toBe(6);
    });
    expect((await db.card.findUniqueOrThrow({ where: { id: cardId } })).title).toBe("After");
  });
  it("AI-024/026 allows only one of two overlapping transactions at revision 5", async () => {
    let entered = 0; let ready!: () => void;
    const barrier = new Promise<void>(resolve => { ready = resolve; });
    const attempt = (title: string) => db.$transaction(async tx => {
      if (++entered === 2) ready();
      await barrier;
      if (!(await assertRevision(workspaceId, 5, tx, { userId }))) return false;
      await tx.card.update({ where: { id: cardId }, data: { title } });
      await bumpRevision(tx, workspaceId);
      return true;
    });
    const results = await Promise.allSettled([attempt("A"), attempt("B")]);
    expect(results.map(r => r.status === "fulfilled" ? r.value : "error").sort()).toEqual([false, true]);
    expect((await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).revision).toBe(6);
  });
  it("AI-019/020 denies outsider and revoked membership", async () => {
    expect(await db.$transaction(tx => assertRevision(workspaceId, 5, tx, { userId: foreignUserId }))).toBe(false);
    await db.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
    expect(await db.$transaction(tx => assertRevision(workspaceId, 5, tx, { userId }))).toBe(false);
  });
  it("rechecks manager privileges for column changes", async () => {
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { role: "MEMBER" } });
    expect(await db.$transaction(tx => assertRevision(workspaceId, 5, tx, { userId, manageColumns: true }))).toBe(false);
    expect(await db.$transaction(tx => assertRevision(workspaceId, 5, tx, { userId }))).toBe(true);
  });
  it.each(["user", "workspace", "organization", "readOnly"])("AI-021 rejects changed lifecycle: %s", async kind => {
    if (kind === "user") await db.user.update({ where: { id: userId }, data: { lifecycleStatus: "SUSPENDED" } });
    if (kind === "workspace") await db.workspace.update({ where: { id: workspaceId }, data: { lifecycleStatus: "ARCHIVED" } });
    if (kind === "organization") await db.organization.update({ where: { id: orgId }, data: { lifecycleStatus: "SUSPENDED" } });
    if (kind === "readOnly") await db.organization.update({ where: { id: orgId }, data: { readOnlyAt: new Date() } });
    expect(await db.$transaction(tx => assertRevision(workspaceId, 5, tx, { userId }))).toBe(false);
  });
  it("AI-027 rolls back a card, new card and revision on an injected failure", async () => {
    const count = await db.card.count({ where: { workspaceId } });
    await expect(db.$transaction(async tx => {
      expect(await assertRevision(workspaceId, 5, tx, { userId })).toBe(true);
      await tx.card.update({ where: { id: cardId }, data: { title: "Temporary" } });
      await tx.card.create({ data: { workspaceId, columnId, title: "Temporary new card" } });
      await bumpRevision(tx, workspaceId);
      throw new Error("INJECTED_FAILURE");
    })).rejects.toThrow("INJECTED_FAILURE");
    expect(await db.card.count({ where: { workspaceId } })).toBe(count);
    expect((await db.card.findUniqueOrThrow({ where: { id: cardId } })).title).toBe("Before");
    expect((await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).revision).toBe(5);
  });
});

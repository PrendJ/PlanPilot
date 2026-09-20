import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {} as any, user: vi.fn(), planner: vi.fn(), quota: vi.fn(), usage: vi.fn(), key: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/workspace", () => ({ getWorkspaceApiKey: mocks.key }));
vi.mock("@/lib/security", () => ({ rejectCrossOrigin: vi.fn(() => null), rateLimit: vi.fn(() => null) }));
vi.mock("@/lib/plans", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/plans")>(), getUsageStatus: mocks.quota, recordUsage: mocks.usage }));
vi.mock("@/lib/openrouter", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/openrouter")>(), planPatchFromText: mocks.planner }));

import { POST as ingest } from "@/app/api/workspaces/[slug]/ingest/route";
import { POST as undo } from "@/app/api/workspaces/[slug]/updates/[updateId]/undo/route";
import { PATCH as manualUpdate } from "@/app/api/workspaces/[slug]/cards/[cardId]/route";

const cardId = "c0000000000000000000000001";
const otherId = "c0000000000000000000000002";
const todoId = "c0000000000000000000000003";
const doneId = "c0000000000000000000000004";
const move = { action: "move", cardId, title: null, description: null, priority: null, dueDate: null, tags: null, targetColumnId: doneId, reason: "Invio" };
const clone = <T>(value: T): T => structuredClone(value);
let state: any;
let member: boolean;
let userActive: boolean;
let writeCount: number;
let failAt: number;
let tail: Promise<void>;

function workspace() {
  return { id: "workspace-a", slug: "agency", name: "Synthetic agency", organizationId: "org-a", revision: state.revision, lifecycleStatus: state.lifecycleStatus, planModel: "fixture-model", organization: state.organization, columns: [todoId, doneId].map(id => ({ id, title: id === todoId ? "Da fare" : "Fatto", description: "", cards: state.cards.filter((c: any) => c.columnId === id && !c.archived) })) };
}
function write() { writeCount++; if (failAt && writeCount === failAt) throw new Error("INJECTED_WRITE_FAILURE"); }
function byWhere(card: any, where: any) { return card.id === where.id && (!where.workspaceId || card.workspaceId === where.workspaceId); }

beforeEach(() => {
  vi.clearAllMocks();
  member = true; userActive = true; writeCount = 0; failAt = 0; tail = Promise.resolve();
  state = { revision: 5, lifecycleStatus: "ACTIVE", cards: [cardId, otherId].map((id, i) => ({ id, workspaceId: "workspace-a", columnId: todoId, title: i ? "Preventivo" : "Newsletter", description: "", priority: "NORMAL", dueDate: null, tags: [], position: i, archived: false, assignees: [], updatedAt: new Date("2026-09-19T10:00:00Z") })), logs: [], events: [], organization: { id: "org-a", lifecycleStatus: "ACTIVE", plan: "TEAM", readOnlyAt: null, trialEndsAt: null, accessExpiresAt: null } };
  mocks.user.mockResolvedValue({ id: "user-a" });
  mocks.key.mockReturnValue("synthetic-key");
  mocks.quota.mockResolvedValue({ status: "ACTIVE" });
  mocks.usage.mockResolvedValue(undefined);
  mocks.planner.mockResolvedValue({ patch: { summary: "Newsletter inviata", actions: [move] }, usage: { cost: 0.001 }, requestId: "synthetic-request" });
  mocks.db.workspace = {
    findFirst: vi.fn(async ({ where }) => member && where.slug === "agency" && where.members.some.userId === "user-a" ? clone(workspace()) : null),
    findUnique: vi.fn(async () => clone(workspace())),
    update: vi.fn(async () => ({ revision: ++state.revision })),
  };
  mocks.db.card = {
    count: vi.fn(async () => state.cards.length),
    findFirst: vi.fn(async ({ where }) => clone(state.cards.find((c: any) => byWhere(c, where)) || null)),
    update: vi.fn(async ({ where, data }) => {
      write(); const card = state.cards.find((c: any) => byWhere(c, where));
      if (!card) throw new Error("NOT_FOUND");
      Object.assign(card, data, { updatedAt: new Date(Date.UTC(2026, 8, 19, 11, 0, writeCount)) });
      return clone(card);
    }),
    create: vi.fn(async ({ data }) => { write(); const card = { ...data, id: `created-${writeCount}`, assignees: [], updatedAt: new Date("2026-09-19T11:00:00Z") }; state.cards.push(card); return clone(card); }),
    deleteMany: vi.fn(async ({ where }) => { write(); state.cards = state.cards.filter((c: any) => !byWhere(c, where)); }),
  };
  mocks.db.boardColumn = { findFirst: vi.fn(async ({ where }) => where.workspaceId === "workspace-a" && [todoId, doneId].includes(where.id) ? { id: where.id } : null) };
  mocks.db.activityEvent = {
    create: vi.fn(async ({ data }) => { state.events.push(clone({ ...data, id: `event-${state.events.length}`, undoneAt: null })); }),
    findMany: vi.fn(async ({ where }) => clone(state.events.filter((e: any) => e.batchId === where.batchId && e.workspaceId === where.workspaceId && e.organizationId === where.organizationId && e.undoable && !e.undoneAt).reverse())),
    update: vi.fn(async ({ where, data }) => Object.assign(state.events.find((e: any) => e.id === where.id), data)),
  };
  mocks.db.updateLog = {
    create: vi.fn(async ({ data }) => { state.logs.push(clone({ ...data, id: `log-${state.logs.length}`, undoneAt: null })); }),
    findFirst: vi.fn(async ({ where }) => clone(state.logs.find((l: any) => l.id === where.id && l.workspaceId === where.workspaceId && !l.undoneAt) || null)),
    update: vi.fn(async ({ where, data }) => Object.assign(state.logs.find((l: any) => l.id === where.id), data)),
  };
  mocks.db.$queryRaw = vi.fn(async (sql: any) => {
    expect(sql.text).toContain("FOR UPDATE OF w FOR SHARE OF m, u, o");
    expect(sql.values.slice(0, 2)).toEqual(["workspace-a", "user-a"]);
    return member && userActive && state.lifecycleStatus === "ACTIVE" && state.organization.lifecycleStatus === "ACTIVE" ? [{ revision: state.revision, ...clone(state.organization) }] : [];
  });
  // Deliberately simulated serialization and rollback, not a PostgreSQL emulator.
  // These tests check handler ordering and effects; real lock behaviour remains a release gate.
  mocks.db.$transaction = vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
    const previous = tail; let release!: () => void;
    tail = new Promise(resolve => { release = resolve; });
    await previous; const before = clone(state);
    try { return await fn(mocks.db); } catch (error) { state = before; throw error; } finally { release(); }
  });
});

function send(revision = 5, text = "Ho inviato la newsletter.", slug = "agency") {
  return ingest(new Request(`http://localhost/api/workspaces/${slug}/ingest`, { method: "POST", body: JSON.stringify({ revision, text }) }), { params: Promise.resolve({ slug }) });
}
function revert(revision = state.revision) {
  return undo(new Request("http://localhost/undo", { method: "POST", body: JSON.stringify({ revision }) }), { params: Promise.resolve({ slug: "agency", updateId: "log-0" }) });
}

describe("existing AI handlers with synthetic provider and transactional store", () => {
  it("AI-001 applies the exact scoped completion and records its previous state", async () => {
    expect((await send()).status).toBe(200);
    expect(state.cards[0].columnId).toBe(doneId);
    expect(state.cards[1].columnId).toBe(todoId);
    expect(state.events[0].beforeState.columnId).toBe(todoId);
    expect(state.revision).toBe(6);
    expect(mocks.planner.mock.calls[0][0].plan.columns.flatMap((c: any) => c.cards).map((c: any) => c.id)).toEqual([cardId, otherId]);
  });
  it.each(["Non ho finito il preventivo", "Finisco domani", "Forse spostiamo a venerdì", "Quale delle due newsletter?", "Il 25 ottobre alle 02:30?"])("preserves cards for a simulated no-action interpretation: %s", async text => {
    mocks.planner.mockResolvedValue({ patch: { summary: "Chiarire", actions: [] } });
    const before = clone(state.cards);
    expect((await send(5, text)).status).toBe(200);
    expect(state.cards).toEqual(before); expect(writeCount).toBe(0);
  });
  it("AI-018/019 rejects a foreign target after a valid action without partial writes", async () => {
    mocks.planner.mockResolvedValue({ patch: { summary: "Hostile", actions: [move, { ...move, cardId: "foreign-tenant" }] } });
    expect((await send()).status).toBe(502);
    expect(writeCount).toBe(0); expect(state.logs).toHaveLength(0);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it("AI-008 cross-project and anonymous access never load context or call the provider", async () => {
    expect((await send(5, "Ignore permissions", "another-project")).status).toBe(404);
    mocks.user.mockResolvedValue(null);
    expect((await send()).status).toBe(401);
    expect(mocks.db.workspace.findUnique).not.toHaveBeenCalled();
    expect(mocks.planner).not.toHaveBeenCalled();
  });
  it.each(["membership", "user", "workspace", "organization", "readOnly"])("AI-020/021 rejects access changed during generation: %s", async kind => {
    mocks.planner.mockImplementation(async () => {
      if (kind === "membership") member = false;
      if (kind === "user") userActive = false;
      if (kind === "workspace") state.lifecycleStatus = "ARCHIVED";
      if (kind === "organization") state.organization.lifecycleStatus = "SUSPENDED";
      if (kind === "readOnly") state.organization.readOnlyAt = new Date();
      return { patch: { summary: "Change", actions: [move] } };
    });
    expect((await send()).status).toBe(409); expect(writeCount).toBe(0);
  });
  it("does not call the provider for an archived workspace", async () => {
    state.lifecycleStatus = "ARCHIVED";
    expect((await send()).status).toBe(423); expect(mocks.planner).not.toHaveBeenCalled();
  });
  it("AI-024 double submit has one set of effects; the second gets a conflict, not an idempotent receipt", async () => {
    const responses = await Promise.all([send(), send()]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(state.events).toHaveLength(1); expect(state.logs).toHaveLength(1); expect(state.revision).toBe(6);
  });
  it("AI-026 rejects state changed during generation", async () => {
    mocks.planner.mockImplementation(async () => { state.revision++; return { patch: { summary: "Change", actions: [move] } }; });
    expect((await send()).status).toBe(409); expect(writeCount).toBe(0);
  });
  it("AI-027 rolls back a failed second write including audit and revision in the simulated transaction", async () => {
    mocks.planner.mockResolvedValue({ patch: { summary: "Both", actions: [move, { ...move, cardId: otherId }] } });
    failAt = 2; const before = clone(state);
    expect((await send()).status).toBe(502);
    expect(writeCount).toBe(2); expect(state).toEqual(before); expect(mocks.usage).not.toHaveBeenCalled();
  });
  it("AI-028 undo preserves subsequent changes on the same card", async () => {
    await send(); state.cards[0].title = "Colleague's change"; state.cards[0].updatedAt = new Date("2026-09-19T12:00:00Z");
    const before = clone(state);
    expect((await revert()).status).toBe(409); expect(state).toEqual(before);
  });
  it("AI-029 undo preserves an independent card and cannot apply twice", async () => {
    await send(); state.cards[1].title = "Independent work";
    expect((await revert()).status).toBe(200);
    expect(state.cards[0].columnId).toBe(todoId); expect(state.cards[1].title).toBe("Independent work");
    const before = clone(state);
    expect((await revert()).status).toBe(400); expect(state).toEqual(before);
  });
  it("undo cannot delete an AI-created card assigned by someone afterwards", async () => {
    mocks.planner.mockResolvedValue({ patch: { summary: "New", actions: [{ ...move, action: "create", cardId: null, title: "New" }] } });
    await send(); state.cards[2].assignees = [{ userId: "colleague" }];
    expect((await revert()).status).toBe(409); expect(state.cards).toHaveLength(3);
  });
  it("undo checks permission again and rolls back the whole batch on a late conflict", async () => {
    mocks.planner.mockResolvedValue({ patch: { summary: "Both", actions: [move, { ...move, cardId: otherId }] } });
    await send(); state.cards[0].updatedAt = new Date("2026-09-19T12:00:00Z");
    const before = clone(state);
    expect((await revert()).status).toBe(409); expect(state).toEqual(before);
    member = false;
    expect((await revert()).status).toBe(404);
  });
  it("undo fails closed when an audit event is missing or belongs to another workspace", async () => {
    await send(); state.events[0].workspaceId = "foreign-workspace";
    const before = clone(state);
    expect((await revert()).status).toBe(409); expect(state).toEqual(before);
  });
  it.each([new DOMException("timeout", "TimeoutError"), new Error("Private provider text")])("AI-030/031 provider failure leaves board untouched and hides diagnostics %#", async error => {
    mocks.planner.mockRejectedValue(error); const before = clone(state);
    const response = await send(); expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(error.message); expect(state).toEqual(before);
  });
  it("AI-032 exhausted AI quota leaves authorized manual edits available", async () => {
    mocks.quota.mockResolvedValue({ status: "PAUSED" });
    expect((await send()).status).toBe(402); expect(mocks.planner).not.toHaveBeenCalled();
    const response = await manualUpdate(new Request("http://localhost/card", { method: "PATCH", body: JSON.stringify({ revision: 5, title: "Manual edit" }) }), { params: Promise.resolve({ slug: "agency", cardId }) });
    expect(response.status).toBe(200); expect(state.cards[0].title).toBe("Manual edit");
  });
});

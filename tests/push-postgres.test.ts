import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
const state = vi.hoisted(() => ({ db: null as any, send: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: (_target, key) => { const value = state.db?.[key]; return typeof value === "function" ? value.bind(state.db) : value; } }) }));
vi.mock("web-push", () => ({ default: { sendNotification: state.send } }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: state.session }));
import { queueProjectPush, dispatchProjectPush } from "@/lib/push";
import { POST as subscribe } from "@/app/api/notifications/subscription/route";
const url = process.env.BOARDCUE_TEST_DATABASE_URL;
if (url) { const parsed = new URL(url); if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || !/^\/boardcue_test_[a-zA-Z0-9_]+$/.test(parsed.pathname) || parsed.searchParams.has("host")) throw new Error("Only an explicitly named disposable loopback database is allowed"); }
describe.skipIf(!url)("Web Push outbox on real local PostgreSQL, transport mocked", () => {
  let db: PrismaClient, actor: string, recipient: string, outsider: string, org: string, workspace: string, session: string;
  const marker = crypto.randomUUID();
  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: url }); state.db = db;
    const users = await Promise.all(["actor", "recipient", "outsider"].map(name => db.user.create({ data: { name, email: `${name}-${marker}@example.invalid`, passwordHash: "SYNTHETIC", emailVerifiedAt: new Date() } })));
    [actor, recipient, outsider] = users.map(user => user.id);
    org = (await db.organization.create({ data: { name: "Fixture", slug: marker, createdById: actor, plan: "TEAM" } })).id;
    workspace = (await db.workspace.create({ data: { name: "Fixture", slug: marker, organizationId: org, createdById: actor, members: { create: [{ userId: actor, role: "OWNER" }, { userId: recipient, role: "MEMBER" }] } } })).id;
  });
  beforeEach(async () => {
    state.send.mockReset().mockResolvedValue({});
    vi.stubEnv("WEB_PUSH_ENABLED", "true"); vi.stubEnv("VAPID_PUBLIC_KEY", "A".repeat(87)); vi.stubEnv("VAPID_PRIVATE_KEY", "B".repeat(43)); vi.stubEnv("VAPID_SUBJECT", "mailto:fixture@example.invalid");
    await db.session.deleteMany({ where: { userId: { in: [actor, recipient, outsider] } } });
    await db.activityEvent.deleteMany({ where: { workspaceId: workspace } });
    await db.user.update({ where: { id: recipient }, data: { lifecycleStatus: "ACTIVE" } });
    await db.workspace.update({ where: { id: workspace }, data: { lifecycleStatus: "ACTIVE" } });
    await db.organization.update({ where: { id: org }, data: { lifecycleStatus: "ACTIVE" } });
    await db.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: workspace, userId: recipient } }, create: { workspaceId: workspace, userId: recipient }, update: { role: "MEMBER" } });
    for (const userId of [actor, recipient, outsider]) {
      const s = await db.session.create({ data: { userId, tokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 600000), pushSubscriptions: { create: { endpoint: `https://fcm.googleapis.com/fcm/send/${marker}-${userId}`, p256dh: "A".repeat(87), auth: "B".repeat(22) } } } });
      if (userId === recipient) session = s.id;
    }
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    try { if (org) await db.organization.delete({ where: { id: org } }); for (const id of [actor, recipient, outsider].filter(Boolean)) await db.user.delete({ where: { id } }); }
    finally { await db?.$disconnect(); }
  });
  const eventInput = () => ({ organizationId: org, workspaceId: workspace, userId: actor, type: "CARD_UPDATED", entityType: "CARD" });
  async function enqueue() {
    await db.$transaction(async tx => { const event = await tx.activityEvent.create({ data: eventInput() }); await queueProjectPush(tx, event); });
  }
  it("rolls back notification deliveries with the board transaction", async () => {
    await expect(db.$transaction(async tx => { const event = await tx.activityEvent.create({ data: eventInput() }); await queueProjectPush(tx, event); throw new Error("SYNTHETIC_ROLLBACK"); })).rejects.toThrow("SYNTHETIC_ROLLBACK");
    expect(await db.pushDelivery.count({ where: { event: { workspaceId: workspace } } })).toBe(0); expect(state.send).not.toHaveBeenCalled();
  });
  it("deduplicates batch actions and excludes actor and cross-tenant outsider", async () => {
    const batchId = crypto.randomUUID();
    await db.$transaction(async tx => { for (let i = 0; i < 2; i++) { const event = await tx.activityEvent.create({ data: { ...eventInput(), batchId } }); await queueProjectPush(tx, event); } });
    const jobs = await db.pushDelivery.findMany({ where: { event: { workspaceId: workspace } }, include: { subscription: { include: { session: true } } } });
    expect(jobs).toHaveLength(1); expect(jobs[0].subscription.session.userId).toBe(recipient);
    expect((await dispatchProjectPush()).sent).toBe(1); expect((await dispatchProjectPush()).sent).toBe(0); expect(state.send).toHaveBeenCalledOnce();
  });
  it.each(["membership", "role", "session", "account", "workspace", "organization"])("does not send after revocation of %s", async kind => {
    await enqueue();
    if (kind === "membership") await db.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: workspace, userId: recipient } } });
    if (kind === "role") await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: workspace, userId: recipient } }, data: { role: "REVOKED" } });
    if (kind === "session") await db.session.update({ where: { id: session }, data: { expiresAt: new Date(0) } });
    if (kind === "account") await db.user.update({ where: { id: recipient }, data: { lifecycleStatus: "SUSPENDED" } });
    if (kind === "workspace") await db.workspace.update({ where: { id: workspace }, data: { lifecycleStatus: "ARCHIVED" } });
    if (kind === "organization") await db.organization.update({ where: { id: org }, data: { lifecycleStatus: "SUSPENDED" } });
    await dispatchProjectPush(); expect(state.send).not.toHaveBeenCalled();
  });
  it("logout cascades subscriptions and pending deliveries", async () => {
    await enqueue(); await db.session.delete({ where: { id: session } });
    expect(await db.pushSubscription.count({ where: { sessionId: session } })).toBe(0);
    expect(await db.pushDelivery.count({ where: { event: { workspaceId: workspace } } })).toBe(0);
  });
  it("concurrent dispatchers claim the same job only once", async () => {
    await enqueue(); state.send.mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 80)); return {}; });
    await Promise.all([dispatchProjectPush(), dispatchProjectPush()]); expect(state.send).toHaveBeenCalledOnce();
  });
  it("repeated subscription preserves queued jobs and endpoint ownership cannot cross users", async () => {
    await enqueue(); const current = await db.pushSubscription.findFirstOrThrow({ where: { sessionId: session } });
    const request = () => new Request("https://fixture.test/api/notifications/subscription", { method: "POST", headers: { origin: "https://fixture.test", "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: current.endpoint, keys: { p256dh: current.p256dh, auth: current.auth } }) });
    state.session.mockResolvedValue({ id: session, userId: recipient });
    expect((await subscribe(request())).status).toBe(200); expect((await subscribe(request())).status).toBe(200);
    expect(await db.pushDelivery.count({ where: { subscriptionId: current.id } })).toBe(1);
    const foreignSession = await db.session.findFirstOrThrow({ where: { userId: outsider } }); state.session.mockResolvedValue({ id: foreignSession.id, userId: outsider });
    expect((await subscribe(request())).status).toBe(409);
    expect((await db.pushSubscription.findUniqueOrThrow({ where: { id: current.id } })).sessionId).toBe(session);
    expect(await db.pushSubscription.count({ where: { sessionId: foreignSession.id } })).toBe(1);
  });
  it("orders a concurrent membership revocation after an already authorized in-flight send", async () => {
    await enqueue(); let release!: () => void, entered!: () => void;
    const sending = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    state.send.mockImplementation(async () => { entered(); await gate; return {}; });
    const dispatch = dispatchProjectPush(); await sending;
    let revoked = false;
    const revocation = db.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: workspace, userId: recipient } } }).then(() => { revoked = true; });
    try { await new Promise(resolve => setTimeout(resolve, 30)); expect(revoked).toBe(false); }
    finally { release(); await Promise.all([dispatch, revocation]); }
    expect(revoked).toBe(true); expect(state.send).toHaveBeenCalledOnce();
  });
});

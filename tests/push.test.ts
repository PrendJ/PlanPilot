import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: {} as any, send: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send } }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.session }));
import { allowedPushEndpoint, pushConfig, pushSubscriptionSchema } from "@/lib/push-config";
import { queueProjectPush, dispatchProjectPush } from "@/lib/push";
import { GET, POST, DELETE } from "@/app/api/notifications/subscription/route";
import { POST as cron } from "@/app/api/cron/notifications/route";
const valid = { endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) } };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("WEB_PUSH_ENABLED", "true"); vi.stubEnv("VAPID_PUBLIC_KEY", "A".repeat(87)); vi.stubEnv("VAPID_PRIVATE_KEY", "B".repeat(43)); vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.invalid");
  mocks.db.pushSubscription = { findMany: vi.fn().mockResolvedValue([{ id: "subscription" }]), findFirst: vi.fn().mockResolvedValue(null), deleteMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) };
  mocks.db.pushDelivery = { createMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn().mockResolvedValue([{ id: "job" }]), updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn().mockResolvedValue({ attempts: 1, subscriptionId: "subscription" }) };
  mocks.db.$queryRaw = vi.fn().mockResolvedValue([{ ...valid.keys, endpoint: valid.endpoint, dedupKey: "batch" }]);
  mocks.db.$transaction = vi.fn(async (cb: any) => cb(mocks.db)); mocks.send.mockResolvedValue({});
  mocks.session.mockResolvedValue({ id: crypto.randomUUID(), userId: "user" });
});
afterEach(() => vi.unstubAllEnvs());
const request = (body = valid, method = "POST", origin = "https://boardcue.test") => new Request("https://boardcue.test/api/notifications/subscription", { method, headers: { origin, "Content-Type": "application/json" }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
describe("push subscription boundary", () => {
  it.each(["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://fcm.googleapis.com.evil.test/x", "https://user:pass@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://fcm.googleapis.com/x#fragment", "https://evilpush.apple.com/x"])("rejects unsafe endpoint %s", endpoint => expect(allowedPushEndpoint(endpoint)).toBe(false));
  it("accepts browser services and rejects malformed encryption keys", () => {
    for (const endpoint of [valid.endpoint, "https://updates.push.services.mozilla.com/wpush/v2/a", "https://web.push.apple.com/a", "https://wns2.notify.windows.com/a"]) expect(allowedPushEndpoint(endpoint)).toBe(true);
    expect(pushSubscriptionSchema.safeParse(valid).success).toBe(true); expect(pushSubscriptionSchema.safeParse({ ...valid, keys: { p256dh: "bad", auth: "bad" } }).success).toBe(false);
  });
  it("defaults to disabled and performs no queue/database work", async () => {
    vi.stubEnv("WEB_PUSH_ENABLED", "false"); expect(pushConfig()).toBeNull();
    await queueProjectPush(mocks.db, { id: "event", workspaceId: "workspace", userId: "actor", batchId: null });
    expect(mocks.db.pushSubscription.findMany).not.toHaveBeenCalled(); expect(await dispatchProjectPush()).toMatchObject({ enabled: false });
  });
  it("requires authentication and refuses cross-origin registration", async () => {
    mocks.session.mockResolvedValue(null); expect((await GET()).status).toBe(401); expect((await POST(request())).status).toBe(401);
    expect((await POST(request(valid, "POST", "https://evil.test"))).status).toBe(403);
    expect(mocks.db.pushSubscription.create).not.toHaveBeenCalled();
  });
  it("registers only on the current session; ownership conflict rolls back and returns no keys", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.db.pushSubscription.findFirst).toHaveBeenCalledWith({ where: { endpoint: valid.endpoint, session: { userId: "user" } } });
    expect(mocks.db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { sessionId: expect.any(String) } });
    mocks.db.pushSubscription.create.mockRejectedValue({ code: "P2002" }); const response = await POST(request()); expect(response.status).toBe(409); expect(await response.text()).not.toContain(valid.endpoint);
  });
  it("deletes only the current session subscriptions even if feature disabled", async () => {
    vi.stubEnv("WEB_PUSH_ENABLED", "false"); mocks.session.mockResolvedValue({ id: "own-session", userId: "user" });
    expect((await DELETE(request(valid, "DELETE"))).status).toBe(200); expect(mocks.db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { sessionId: "own-session" } });
  });
  it("repeated registration preserves the existing subscription and its queued deliveries", async () => {
    mocks.session.mockResolvedValue({ id: "own-session", userId: "user" });
    mocks.db.pushSubscription.findFirst.mockResolvedValue({ id: "subscription", sessionId: "own-session", ...valid.keys });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.db.pushSubscription.deleteMany).not.toHaveBeenCalled(); expect(mocks.db.pushSubscription.create).not.toHaveBeenCalled(); expect(mocks.db.pushSubscription.update).not.toHaveBeenCalled();
  });
  it("protects dispatcher with a configured secret", async () => {
    vi.stubEnv("CRON_SECRET", ""); expect((await cron(new Request("https://boardcue.test/api/cron/notifications", { method: "POST" }))).status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
describe("transactional outbox and dispatch (deterministic transport mock)", () => {
  it("queues one delivery per recipient and batch inside the caller transaction", async () => {
    await queueProjectPush(mocks.db, { id: "event", workspaceId: "workspace", userId: "actor", batchId: "batch" });
    expect(mocks.db.pushDelivery.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ subscriptionId: "subscription", eventId: "event", dedupKey: "batch", availableAt: expect.any(Date), createdAt: expect.any(Date) })], skipDuplicates: true });
    expect(mocks.db.pushSubscription.findMany.mock.calls[0][0].where.session.user).toMatchObject({ id: { not: "actor" }, memberships: { some: { workspaceId: "workspace" } } });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("losing a job claim does not send duplicates", async () => {
    mocks.db.pushDelivery.updateMany.mockResolvedValue({ count: 0 }); await dispatchProjectPush(); expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.db.pushDelivery.updateMany.mock.calls[0][0].where).toMatchObject({ availableAt: { lte: expect.any(Date) }, attempts: { lt: 3 } });
  });
  it("rechecks membership, account, session and lifecycle under locks immediately before sending", async () => {
    const result = await dispatchProjectPush(); expect(result.sent).toBe(1);
    const sql = mocks.db.$queryRaw.mock.calls[0][0]; expect(sql.strings.join("?")).toContain('FOR SHARE OF p, s, u, w, o, m');
    expect(sql.strings.join("?")).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'");
    expect(mocks.send.mock.calls[0][1]).toMatch(/^\{"tag":"[A-Za-z0-9_-]{32}"\}$/);
    expect(mocks.send.mock.calls[0][2]).toMatchObject({ timeout: 3000, TTL: 3600 });
  });
  it("revoked permissions, expired sessions and cross-tenant targets are discarded when the guarded query returns no authorized row", async () => {
    mocks.db.$queryRaw.mockResolvedValue([]); expect((await dispatchProjectPush()).discarded).toBe(1); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects an unsafe endpoint even if stored before validation existed", async () => {
    mocks.db.$queryRaw.mockResolvedValue([{ endpoint: "http://localhost/secret" }]); await dispatchProjectPush(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([404, 410])("removes an expired subscription on HTTP %s", async statusCode => {
    mocks.send.mockRejectedValue({ statusCode }); expect((await dispatchProjectPush()).discarded).toBe(1); expect(mocks.db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: "subscription" } });
  });
  it("retries timeout with a delay and stops after the third attempt", async () => {
    mocks.send.mockRejectedValue(new Error("timeout")); expect((await dispatchProjectPush()).retried).toBe(1);
    expect(mocks.db.pushDelivery.updateMany.mock.calls.at(-1)[0].data).toMatchObject({ leaseToken: null, leaseUntil: null, availableAt: expect.any(Date) });
    mocks.db.pushDelivery.findFirst.mockResolvedValue({ attempts: 3, subscriptionId: "subscription" }); expect((await dispatchProjectPush()).discarded).toBe(1);
  });
});

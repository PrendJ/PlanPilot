import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const testUrl = process.env.BOARDCUE_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/^\/boardcue_test_[a-zA-Z0-9_]+$/.test(url.pathname) || url.searchParams.has("host")) throw new Error("Disposable local database required");
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");

test.describe("security regressions on a real server", () => {
  test.skip(!testUrl, "Requires disposable local PostgreSQL");
  let db: PrismaClient;
  const marker = randomBytes(8).toString("hex");
  let owner: { id: string; cookie: string }, outsider: { id: string; cookie: string };
  let slug: string, organizationId: string, boardId: string;
  async function person(role: "USER" | "SUPPORT" | "BILLING" | "SUPERADMIN" = "USER") {
    const user = await db.user.create({ data: { name: "Synthetic security fixture", email: `${token()}-${marker}@example.invalid`, passwordHash: await bcrypt.hash("synthetic-existing-password", 12), emailVerifiedAt: new Date(), platformRole: role } });
    const opaque = token();
    await db.session.create({ data: { userId: user.id, tokenHash: hash(opaque), expiresAt: new Date(Date.now() + 3600_000) } });
    return { id: user.id, cookie: `boardcue_session=${opaque}` };
  }
  const auth = (user: { cookie: string }) => ({ cookie: user.cookie });
  test.beforeAll(async ({}, info) => {
    test.skip(info.project.name !== "desktop-1440", "One security run per browser suite");
    db = new PrismaClient({ datasourceUrl: testUrl });
    owner = await person(); outsider = await person();
    const org = await db.organization.create({ data: { name: "Synthetic security organization", slug: `security-${marker}`, createdById: owner.id, plan: "BUSINESS", licenseSource: "MANUAL", seats: 10, members: { create: { userId: owner.id, role: "OWNER" } } } });
    organizationId = org.id;
    const board = await db.workspace.create({ data: { name: "PRIVATE-SECURITY-TITLE", slug: `security-${marker}`, organizationId, createdById: owner.id, members: { create: { userId: owner.id, role: "OWNER" } }, columns: { create: [{ title: "Inbox", position: 0 }, { title: "Done", position: 1 }] } } });
    slug = board.slug; boardId = board.id;
    const column = await db.boardColumn.findFirstOrThrow({ where: { workspaceId: boardId } });
    await db.card.create({ data: { workspaceId: boardId, columnId: column.id, title: "PRIVATE-SECURITY-CARD" } });
  });
  test.afterEach(async () => { if (db) await db.organization.update({ where: { id: organizationId }, data: { require2fa: false } }); });
  test.afterAll(async () => {
    if (!db) return;
    try {
      const users = await db.user.findMany({ where: { email: { endsWith: `-${marker}@example.invalid` } }, select: { id: true } });
      const ids = users.map(user => user.id);
      await db.adminAuditEvent.deleteMany({ where: { actorId: { in: ids } } });
      await db.organization.deleteMany({ where: { createdById: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    } finally { await db.$disconnect(); }
  });

  test("limited platform roles cannot promote themselves through either field", async ({ request }) => {
    for (const role of ["SUPPORT", "BILLING"] as const) {
      const user = await person(role);
      for (const payload of [{ isAdmin: true }, { platformRole: "SUPERADMIN" }, { isAdmin: true, platformRole: "USER" }])
        expect((await request.patch("/api/admin/users", { headers: auth(user), data: { id: user.id, ...payload } })).status()).toBe(403);
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).platformRole).toBe(role);
    }
  });
  test("required enrollment blocks search, print, export and old API tokens", async ({ request, page, baseURL }) => {
    await db.organization.update({ where: { id: organizationId }, data: { require2fa: true } });
    const api = `bc_${token()}`;
    await db.apiToken.create({ data: { userId: owner.id, name: "Synthetic", tokenHash: hash(api), prefix: api.slice(0, 7) } });
    for (const url of [`/api/workspaces/${slug}/board`, "/api/search?q=PRIVATE", `/api/organizations/${organizationId}/export`, "/api/account/tokens"])
      expect((await request.get(url, { headers: auth(owner) })).status()).toBeGreaterThanOrEqual(400);
    const cards = await request.get(`/api/v1/boards/${slug}/cards`, { headers: { authorization: `Bearer ${api}` } });
    expect(cards.status()).toBe(401);
    await page.context().addCookies([{ name: "boardcue_session", value: owner.cookie.split("=")[1], url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await page.goto(`/app/${slug}/print`);
    await expect(page).toHaveURL(/\/account\?require2fa=1/);
    expect(await page.content()).not.toContain("PRIVATE-SECURITY-CARD");
    await page.screenshot({ path: test.info().outputPath("required-enrollment.png") });
  });
  test("foreign and invalid sessions cannot learn private metadata", async ({ request }) => {
    for (const headers of [auth(outsider), { cookie: "boardcue_session=invalid-synthetic" }]) {
      const response = await request.get(`/app/${slug}`, { headers, maxRedirects: 0 });
      expect(await response.text()).not.toContain("PRIVATE-SECURITY-TITLE");
    }
  });
  test("API tokens expire and read-only tokens cannot write cards", async ({ request }) => {
    const column = await db.boardColumn.findFirstOrThrow({ where: { workspaceId: boardId } });
    const read = `bc_${token()}`, expired = `bc_${token()}`;
    await db.apiToken.createMany({ data: [
      { userId: owner.id, name: "Read fixture", tokenHash: hash(read), prefix: read.slice(0, 7), access: "read" },
      { userId: owner.id, name: "Expired fixture", tokenHash: hash(expired), prefix: expired.slice(0, 7), expiresAt: new Date(0) },
    ] });
    expect((await request.get(`/api/v1/boards/${slug}/cards`, { headers: { authorization: `Bearer ${read}` } })).status()).toBe(200);
    expect((await request.post(`/api/v1/boards/${slug}/cards`, { headers: { authorization: `Bearer ${read}` }, data: { columnId: column.id, title: "Must not exist" } })).status()).toBe(401);
    expect((await request.get("/api/v1/boards", { headers: { authorization: `Bearer ${expired}` } })).status()).toBe(401);
    expect(await db.card.count({ where: { workspaceId: boardId, title: "Must not exist" } })).toBe(0);
  });
  test("admin writes reject foreign origins and plain text JSON", async ({ request }) => {
    const admin = await person("SUPERADMIN");
    const body = { id: outsider.id, isAdmin: true };
    expect((await request.patch("/api/admin/users", { headers: { ...auth(admin), origin: "https://attacker.example", "x-forwarded-host": "attacker.example" }, data: body })).status()).toBe(403);
    expect((await request.patch("/api/admin/users", { headers: { ...auth(admin), "content-type": "text/plain" }, data: JSON.stringify(body) })).status()).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: outsider.id } })).platformRole).toBe("USER");
  });
  test("a reset token works once under concurrency and revokes old credentials", async ({ request }) => {
    const user = await person(); const reset = token(), api = `bc_${token()}`;
    await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hash(reset), expiresAt: new Date(Date.now() + 3600_000) } });
    await db.apiToken.create({ data: { userId: user.id, name: "Synthetic", tokenHash: hash(api), prefix: api.slice(0, 7) } });
    const responses = await Promise.all(["synthetic-new-password-one", "synthetic-new-password-two"].map(password => request.post("/api/auth/reset-password", { data: { token: reset, password } })));
    expect(responses.map(response => response.status()).sort()).toEqual([200, 400]);
    expect((await request.get("/api/account/tokens", { headers: auth(user) })).status()).toBe(401);
    expect((await request.get("/api/v1/boards", { headers: { authorization: `Bearer ${api}` } })).status()).toBe(401);
  });
  test("first mailbox proof retires pre-registration access and lets the owner set a password", async ({ request, page }) => {
    const email = `claim-${marker}@example.invalid`;
    const signup = await request.post("/api/auth/register", { data: { name: "Synthetic mailbox owner", email, password: "synthetic-attacker-password" } });
    expect(signup.status()).toBe(201);
    const oldCookie = signup.headers()["set-cookie"].split(";")[0];
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const proof = token();
    await db.verificationToken.deleteMany({ where: { userId: user.id } });
    await db.verificationToken.create({ data: { userId: user.id, tokenHash: hash(proof), expiresAt: new Date(Date.now() + 3600_000) } });
    await page.goto(`/api/auth/verify?token=${proof}`);
    await expect(page).toHaveURL(/\/reset-password\?token=.+&verified=1/);
    expect((await request.get("/api/account/tokens", { headers: { cookie: oldCookie } })).status()).toBe(401);
    expect(await bcrypt.compare("synthetic-attacker-password", (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash)).toBe(false);
    await page.getByLabel("Nuova password", { exact: true }).fill("synthetic-owner-password");
    await page.getByRole("button", { name: "Salva la nuova password", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);
    expect((await request.post("/api/auth/login", { data: { email, password: "synthetic-owner-password" } })).status()).toBe(200);
  });
  test("concurrent owner changes preserve at least one owner", async ({ request }) => {
    const second = await person();
    await db.organizationMember.create({ data: { organizationId, userId: second.id, role: "MEMBER" } });
    await db.workspaceMember.create({ data: { workspaceId: boardId, userId: second.id, role: "OWNER" } });
    const results = await Promise.all([owner, second].map(user => request.patch(`/api/workspaces/${slug}/members/${user.id}`, { headers: auth(user), data: { role: "MEMBER" } })));
    expect(results.filter(result => result.ok())).toHaveLength(1);
    expect(await db.workspaceMember.count({ where: { workspaceId: boardId, role: "OWNER" } })).toBe(1);
  });
  test("production scripts carry matching nonces and arbitrary inline scripts are blocked", async ({ page, request }) => {
    const response = await request.get("/login");
    const policy = response.headers()["content-security-policy"];
    const nonce = /'nonce-([^']+)'/.exec(policy)![1];
    expect(await response.text()).toContain(`nonce="${nonce}"`);
    await page.route("**/login", async route => {
      const upstream = await route.fetch();
      await route.fulfill({ response: upstream, body: (await upstream.text()).replace("</body>", '<script>document.body.setAttribute("data-security-injected", "yes")</script></body>') });
    });
    await page.goto("/login");
    await expect(page.locator("body")).not.toHaveAttribute("data-security-injected", "yes");
    await expect(page.getByRole("button", { name: "Accedi", exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("csp-login.png") });
  });
});

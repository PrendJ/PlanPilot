import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";

async function fakeUpdate(page: Page) {
  // Deterministic browser fixture for an already downloaded waiting update.
  await page.addInitScript(() => {
    const worker = {
      state: "installed",
      postMessage: () => {
        sessionStorage.setItem("update-requested", "yes");
      },
    };
    const registration = Object.assign(new EventTarget(), { waiting: worker, installing: null, active: {}, update: async () => {} });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: async () => registration,
      ready: Promise.resolve(registration),
    });
    Object.defineProperty(navigator, "serviceWorker", { value: serviceWorker, configurable: true });
  });
}

test("app guide has keyboard focus, escape dismissal and fits the viewport", async ({ page }) => {
  await page.goto("/demo");
  const button = page.getByRole("button", { name: "App", exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "BoardCue sul tuo dispositivo" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Accedi per attivare le notifiche dei progetti.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: test.info().outputPath("app-dialog.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(button).toBeFocused();
});

test("real worker offers offline fallback without caching private pages or APIs", async ({ page, context }) => {
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
  });
  await expect(page.getByRole("button", { name: "Aggiorna ora", exact: true })).toHaveCount(0);
  const keys = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)),
      )
    ).flat(),
  );
  expect(keys.some(key => key.startsWith("/api/") || key === "/login" || key.startsWith("/app"))).toBe(false);
  const swResponse = await page.request.get("/sw.js");
  expect(swResponse.headers()["cache-control"]).toContain("no-store");
  await context.setOffline(true);
  await page.goto("/pwa-offline-fixture");
  await expect(page.getByRole("heading", { name: "Connessione assente" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("offline.png"), fullPage: true });
  await context.setOffline(false);
  await page.getByRole("link", { name: "Riprova ad aprire BoardCue" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("waiting update neither reloads nor activates while a form is dirty", async ({ page }) => {
  await fakeUpdate(page);
  await page.goto("/login");
  const update = page.getByRole("button", { name: "Aggiorna ora", exact: true });
  await expect(update).toBeEnabled();
  await page.locator('input[type="email"]').fill("synthetic@example.invalid");
  await expect(update).toBeDisabled();
  expect(await page.evaluate(() => sessionStorage.getItem("update-requested"))).toBeNull();
  await expect(page.locator('input[type="email"]')).toHaveValue("synthetic@example.invalid");
});

test("explicit update sends activation only after user action", async ({ page }) => {
  await fakeUpdate(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Ho capito", exact: true }).click();
  await page.getByRole("button", { name: "Aggiorna ora", exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("update-requested"))).toBe("yes");
});

test("notification permission denial is explained without saving a subscription", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/notifications/subscription", route => {
    if (route.request().method() === "POST") writes++;
    return route.fulfill({ json: { enabled: true, subscribed: false, publicKey: "A".repeat(87) } });
  });
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "requestPermission", { value: async () => "denied" });
  });
  await page.goto("/demo");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.getByRole("button", { name: "App", exact: true }).click();
  const enable = page.getByRole("button", { name: "Attiva notifiche", exact: true });
  await expect(enable).toBeEnabled();
  await enable.click();
  await expect(page.getByText(/Notifiche non autorizzate/)).toBeVisible();
  expect(writes).toBe(0);
});

const testUrl = process.env.BOARDCUE_TEST_DATABASE_URL;
if (testUrl) {
  const u = new URL(testUrl);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
    !/^\/boardcue_test_[a-zA-Z0-9_]+$/.test(u.pathname) ||
    u.searchParams.has("host")
  )
    throw new Error("E2E requires a synthetic local database");
}
test.describe("authenticated board with synthetic PostgreSQL fixture", () => {
  test.skip(!testUrl, "Requires the isolated local PostgreSQL harness");
  let db: PrismaClient, userId: string, organizationId: string, slug: string, token: string;
  test.beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: testUrl });
    slug = `pwa-${randomUUID()}`;
    token = randomUUID();
    userId = (
      await db.user.create({
        data: {
          name: "PWA fixture",
          email: `${slug}@example.invalid`,
          passwordHash: "SYNTHETIC",
          emailVerifiedAt: new Date(),
          sessions: { create: { tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } },
        },
      })
    ).id;
    organizationId = (
      await db.organization.create({
        data: { name: "Synthetic team", slug, createdById: userId, plan: "TEAM", members: { create: { userId, role: "OWNER" } } },
      })
    ).id;
    await db.workspace.create({
      data: {
        name: "Synthetic project",
        slug,
        organizationId,
        createdById: userId,
        members: { create: { userId, role: "OWNER" } },
        columns: { create: { title: "Da fare", position: 0 } },
      },
    });
  });
  test.afterAll(async () => {
    if (!db) return;
    try {
      if (organizationId) await db.organization.delete({ where: { id: organizationId } });
      if (userId) await db.user.delete({ where: { id: userId } });
    } finally {
      await db.$disconnect();
    }
  });
  test("draft blocks update, manual card save works and offline errors retain text", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "boardcue_session", value: token, url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await fakeUpdate(page);
    await page.goto(`/app/${slug}`);
    await page.getByRole("button", { name: "Ho capito", exact: true }).click();
    const draft = page.getByPlaceholder("Racconta cosa è cambiato…");
    await expect(draft).toBeVisible();
    await draft.fill("Bozza sintetica da conservare");
    await expect(page.getByRole("button", { name: "Aggiorna ora", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Nuova card", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nuova card" });
    await dialog.getByLabel("Titolo").fill("Card sintetica");
    await dialog.getByRole("button", { name: "Crea card", exact: true }).click();
    await expect(page.getByRole("button", { name: "Card sintetica", exact: true })).toBeVisible();
    await expect(draft).toHaveValue("Bozza sintetica da conservare");
    await context.setOffline(true);
    await page.getByRole("button", { name: "Invia", exact: true }).click();
    await expect(page.getByText(/Il testo è rimasto qui/)).toBeVisible();
    await expect(draft).toHaveValue("Bozza sintetica da conservare");
    await context.setOffline(false);
    await page.screenshot({ path: test.info().outputPath("board-draft.png"), fullPage: true });
    await draft.fill("");
    await expect(page.getByRole("button", { name: "Aggiorna ora", exact: true })).toBeEnabled();
  });
});

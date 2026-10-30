import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";

const testUrl = process.env.BOARDCUE_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/^\/boardcue_test_[a-zA-Z0-9_]+$/.test(url.pathname) ||
    url.searchParams.has("host")
  )
    throw new Error("Disposable local database required");
}
test("customer creates, renames and filters workspaces, including on mobile", async ({ page, context, baseURL }) => {
  test.skip(!testUrl, "Requires the disposable local database");
  const db = new PrismaClient({ datasourceUrl: testUrl });
  const marker = randomUUID(),
    token = randomUUID();
  let userId = "",
    orgId = "";
  try {
    const user = await db.user.create({
      data: {
        email: `${marker}@example.invalid`,
        name: "Workspace owner",
        passwordHash: "SYNTHETIC",
        emailVerifiedAt: new Date(),
        sessions: { create: { tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } },
      },
    });
    userId = user.id;
    const org = await db.organization.create({
      data: {
        name: "Team fixture",
        slug: marker,
        plan: "TEAM",
        seats: 4,
        createdById: user.id,
        members: { create: { userId, role: "OWNER" } },
      },
    });
    orgId = org.id;
    await db.user.update({ where: { id: userId }, data: { defaultOrganizationId: orgId, activeOrganizationId: orgId } });
    await db.workspace.create({
      data: {
        name: "Piano editoriale",
        slug: `board-${marker}`,
        organizationId: orgId,
        createdById: userId,
        members: { create: { userId, role: "OWNER" } },
      },
    });
    await context.addCookies([{ name: "boardcue_session", value: token, url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/app$/);
    await page.getByRole("button", { name: "Ho capito", exact: true }).click();
    await page.goto("/workspaces");
    await page.getByLabel("Nuovo workspace", { exact: true }).fill("Marketing");
    await page.getByRole("button", { name: "Crea workspace", exact: true }).click();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Marketing", exact: true }) });
    await section.getByLabel("Nome workspace").fill("Comunicazione");
    await section.getByRole("button", { name: "Rinomina", exact: true }).click();
    const renamed = page.locator("section").filter({ has: page.getByRole("heading", { name: "Comunicazione", exact: true }) });
    await renamed.getByLabel("Board da spostare").selectOption({ label: "Piano editoriale" });
    await renamed.getByRole("button", { name: "Sposta", exact: true }).click();
    await expect(renamed.getByRole("link", { name: "Piano editoriale", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("workspaces.png"), fullPage: true });
    await renamed.getByRole("link", { name: "Apri le board del workspace" }).click();
    await expect(page.getByRole("heading", { name: "Piano editoriale", exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Workspace", exact: true }).selectOption("NONE");
    await expect(page.getByRole("heading", { name: "Piano editoriale", exact: true })).toHaveCount(0);
    await page.getByRole("combobox", { name: "Workspace", exact: true }).selectOption("ALL");
    await expect(page.getByRole("heading", { name: "Piano editoriale", exact: true })).toBeVisible();
  } finally {
    if (orgId) await db.organization.delete({ where: { id: orgId } });
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }
});

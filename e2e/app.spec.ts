import { test, expect } from "@playwright/test";

// Full signed-in journey on the real server + database (no AI provider needed).
test("sign-up lands on a ready board; cards, settings and security work", async ({ page }, testInfo) => {
  test.skip(!["desktop-1440", "chromium"].includes(testInfo.project.name), "Desktop journey");
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.invalid`;
  await page.goto("/register");
  await page.getByLabel("Nome e cognome").fill("Utente Prova");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Scegli una password").fill("una-frase-lunga-di-prova");
  await page.getByRole("button", { name: "Crea account e inizia" }).click();
  await expect(page).toHaveURL(/\/app\/[a-z0-9-]+\?welcome=1/);
  await expect(page.getByRole("heading", { name: "La mia prima board" })).toBeVisible();
  await expect(page.getByText("Prova a raccontare com’è andata")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ho finito di aggiornare il sito web" })).toBeVisible();
  await expect(page.getByText("Conferma il tuo indirizzo")).toBeVisible();

  await page.getByRole("button", { name: "Nuova card" }).click();
  const dialog = page.getByRole("dialog", { name: "Nuova card" });
  await dialog.getByLabel("Titolo").fill("Card creata dal test");
  await dialog.getByPlaceholder("Aggiungi una voce e premi Invio").fill("Prima voce");
  await dialog.getByPlaceholder("Aggiungi una voce e premi Invio").press("Enter");
  await dialog.getByRole("button", { name: "Crea card" }).click();
  await expect(page.getByRole("button", { name: "Card creata dal test", exact: true })).toBeVisible();

  const card = page.getByRole("button", { name: "Card creata dal test", exact: true });
  await card.hover();
  await card.getByRole("button", { name: /Azioni per/ }).click();
  await page
    .getByRole("menuitem", { name: "Completato" })
    .or(page.locator(".menu-item", { hasText: "Completato" }))
    .first()
    .click();
  const done = page.locator("section.column").filter({ has: page.getByRole("heading", { name: "Completato" }) });
  await expect(done.getByText("Card creata dal test")).toBeVisible();

  await page.getByRole("tab", { name: /Lista/ }).click();
  await expect(page.getByRole("table")).toContainText("Card creata dal test");
  await page.getByRole("tab", { name: /Calendario/ }).click();
  await expect(page.locator(".calendar")).toBeVisible();

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Verifica in due passaggi" })).toBeVisible();
  await page.getByRole("button", { name: "Attiva la verifica in due passaggi" }).click();
  await expect(page.getByRole("img", { name: "Codice QR per l’app di autenticazione" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

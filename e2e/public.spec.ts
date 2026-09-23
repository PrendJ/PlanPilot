import { test, expect } from "@playwright/test";

const noOverflow = () => document.documentElement.scrollWidth <= document.documentElement.clientWidth;

test("landing explains the loop and leads to the Pro trial", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Racconta com’è andata");
  await expect(page.getByRole("link", { name: /Prova Pro gratis 14 giorni/ }).first()).toHaveAttribute("href", "/register");
  expect(await page.evaluate(noOverflow)).toBe(true);
});

test("pricing shows the agreed plans, seats and Enterprise without SSO/SLA promises", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Pro", exact: true })).toBeVisible();
  const price = (plan: string) =>
    page
      .locator(".pricing-card")
      .filter({ has: page.getByRole("heading", { name: plan, exact: true }) })
      .locator(".price strong");
  await expect(price("Pro")).toHaveText("€7");
  await expect(price("Team")).toHaveText("€6");
  await expect(price("Business")).toHaveText("€10");
  await expect(page.getByText("IVA esclusa, fatturazione mensile").first()).toBeVisible();
  // Private customers see the VAT-inclusive price, rounded down to ten cents.
  await page.getByRole("button", { name: "Privati", exact: true }).click();
  await expect(price("Pro")).toHaveText("€8,50");
  await expect(price("Team")).toHaveText("€7,30");
  await expect(price("Business")).toHaveText("€12,20");
  await expect(page.getByText("IVA inclusa, fatturazione mensile").first()).toBeVisible();
  await page.getByRole("button", { name: "Aziende e professionisti", exact: true }).click();
  // Annual: the monthly equivalent is rounded down to ten cents too (€100/12 = €8.33 → €8.30).
  await page.getByRole("button", { name: /^Annuale/ }).click();
  await expect(price("Pro")).toHaveText("€5,80");
  await expect(price("Business")).toHaveText("€8,30");
  await expect(page.getByText("€69,60 fatturati una volta l’anno, IVA esclusa")).toBeVisible();
  await page.getByRole("button", { name: "Mensile", exact: true }).click();
  await expect(page.getByText("Minimo 2 posti. Gli ospiti non occupano posti.").first()).toBeVisible();
  await expect(page.getByText("Dettatura vocale inclusa")).toBeVisible();
  await expect(page.getByText(/SSO|SLA|DPA/)).toHaveCount(0);
  const team = page.locator(".pricing-card").filter({ hasText: "Team" }).first();
  await team.getByRole("button", { name: "Un posto in più" }).click();
  await expect(team.locator("output")).toHaveText("4");
  expect(await page.evaluate(noOverflow)).toBe(true);
});

test("English pages are served under /en", async ({ page }) => {
  await page.goto("/en/pricing");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Simple pricing");
});

test("the demo previews a change and moves the existing card instead of duplicating it", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Ho finito la newsletter di ottobre" }).click();
  const proposal = page.getByRole("region", { name: "Modifiche proposte dall’AI" });
  await expect(proposal).toContainText("Sposta “Newsletter di ottobre” in Fatto");
  await proposal.getByRole("button", { name: "Applica tutto" }).click();
  const done = page.locator("section.column").filter({ has: page.getByRole("heading", { name: "Fatto" }) });
  await expect(done.getByText("Newsletter di ottobre")).toBeVisible();
  await expect(page.locator(".card-title", { hasText: "Newsletter di ottobre" })).toHaveCount(1);
  await page.getByRole("button", { name: "Non ho ancora iniziato le foto del catalogo" }).click();
  await expect(page.getByText("Hai detto che non è ancora successo")).toBeVisible();
});

test("registration is usable without horizontal overflow", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("button", { name: "Crea account e inizia" })).toBeVisible();
  await expect(page.getByLabel("Nome del tuo team o progetto")).toHaveCount(0);
  expect(await page.evaluate(noOverflow)).toBe(true);
});

test("authentication outcomes are explained", async ({ page }) => {
  await page.goto("/login?verified=1");
  await expect(page.getByText("Email confermata. Accedi per continuare.")).toBeVisible();
  await page.goto("/login?reset=1");
  await expect(page.getByText("Password aggiornata. Accedi con quella nuova.")).toBeVisible();
});

test("login offers a passwordless link", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Accedi con un link via email" }).click();
  await expect(page.getByRole("button", { name: "Inviami il link" })).toBeVisible();
});

test("external post-login redirects are discarded", async ({ page }) => {
  await page.goto("/login?next=https://evil.example");
  await expect(page.getByRole("link", { name: "Crealo gratis" })).toHaveAttribute("href", "/register");
});

test("an incomplete reset link offers a recovery path", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Link non più valido" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Richiedi un nuovo link" })).toHaveAttribute("href", "/forgot-password");
});

test("private areas redirect to sign-in", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount/);
});

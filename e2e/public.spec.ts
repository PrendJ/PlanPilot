import { test, expect } from "@playwright/test";

const noOverflow = () => document.documentElement.scrollWidth <= document.documentElement.clientWidth;

test("visitors can explore the demo before choosing to log in", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/$/);
  await page.locator(".hero-actions .primary").click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("button", { name: "Ho finito la newsletter di ottobre" })).toBeVisible();
  await page.locator('.topbar a[href="/login"]').click();
  await expect(page).toHaveURL(/\/login$/);
});

test("landing explains the loop and leads to the Pro trial", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hai troppe cose in testa?");
  await expect(page.getByRole("heading", { name: /Un task manager ti chiede di organizzarti prima/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Prova Pro gratis 14 giorni/ }).first()).toHaveAttribute("href", "/register");
  expect(await page.evaluate(noOverflow)).toBe(true);
});

test("pricing shows the agreed plans, seats and Enterprise without SSO/SLA promises", async ({ page }) => {
  await page.goto("/pricing");
  const price = (plan: string) =>
    page
      .locator(".pricing-card")
      .filter({ has: page.getByRole("heading", { name: plan, exact: true }) })
      .locator(".price strong");
  // Private customers come first: Pro personale + Family, VAT included, never Business.
  await expect(price("Pro personale")).toHaveText("€4,90");
  await expect(price("Family")).toHaveText("€5,00");
  await expect(page.getByRole("heading", { name: "Business", exact: true })).toHaveCount(0);
  await expect(page.getByText("IVA inclusa, fatturazione mensile").first()).toBeVisible();
  await page.getByRole("button", { name: "Aziende e professionisti", exact: true }).click();
  await expect(price("Pro")).toHaveText("€7,00");
  await expect(price("Team")).toHaveText("€6,00");
  await expect(price("Business")).toHaveText("€10,00");
  await expect(page.getByText("IVA esclusa, fatturazione mensile").first()).toBeVisible();
  // Annual: the yearly total is shown (10 months, rounded down to ten cents), with the saving spelled out.
  await page.getByRole("button", { name: /^Annuale/ }).click();
  await expect(price("Pro")).toHaveText("€70,00");
  await expect(price("Business")).toHaveText("€100,00");
  await expect(page.getByText(/Con il mensile pagheresti €84,00: risparmi €14,00/)).toBeVisible();
  await page.getByRole("button", { name: "Mensile", exact: true }).click();
  await expect(page.getByText("Minimo 2 posti. Gli ospiti non occupano posti.").first()).toBeVisible();
  await expect(page.getByText("Dettatura vocale inclusa").first()).toBeVisible();
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
  await expect(proposal).toContainText("Sposta “Newsletter di ottobre” in Completato");
  await proposal.getByRole("button", { name: "Applica tutto" }).click();
  await page.getByRole("tab", { name: /Kanban/ }).click();
  const done = page.locator("section.column").filter({ has: page.getByRole("heading", { name: "Completato" }) });
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

test("favicon and PWA icons are served, with cache-busting URLs", async ({ page, request }) => {
  await page.goto("/");
  const hrefs = await page.$$eval('link[rel*="icon"]', nodes => nodes.map(node => node.getAttribute("href")!));
  expect(hrefs).toEqual(expect.arrayContaining([expect.stringMatching(/^\/icon\.svg\?v=/), expect.stringMatching(/^\/favicon\.ico\?v=/)]));
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  const srcs = manifest.icons.map((icon: { src: string }) => icon.src);
  expect(srcs.every((src: string) => src.includes("?v="))).toBe(true);
  for (const url of ["/favicon.ico", ...hrefs, ...srcs]) expect((await request.get(url)).ok(), url).toBe(true);
});

test("the demo sorts one thought across the personal and the work board", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Chiama la banca domani e prepara il preventivo per Studio Rossi entro venerdì" }).click();
  const proposals = page.getByRole("region", { name: "Modifiche proposte dall’AI" });
  await expect(proposals).toHaveCount(2);
  await expect(page.locator(".home-pending").filter({ hasText: "Casa e personale" })).toContainText("Chiama la banca");
  await expect(page.locator(".home-pending").filter({ hasText: "Lavoro" })).toContainText("Preventivo per Studio Rossi");
  await expect(page.getByRole("button", { name: "Devo organizzare la cena di fine anno" })).toBeDisabled();
  expect(await page.evaluate(noOverflow)).toBe(true);
});

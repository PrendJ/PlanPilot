import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

// Opt-in integration suite: requires a disposable, migrated LOCAL database (see scripts/test-local-postgres.mjs).
const testUrl = process.env.BOARDCUE_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/^\/boardcue_test_[a-zA-Z0-9_]+$/.test(url.pathname))
    throw new Error("PostgreSQL tests require a loopback host and a disposable boardcue_test_* database");
}

const state = vi.hoisted(() => ({
  user: null as User | null,
  planner: null as null | ((input: { plan: unknown; userText: string }) => unknown),
}));
vi.mock("@/lib/auth", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: async () => state.user,
}));
vi.mock("@/lib/openrouter", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/openrouter")>()),
  planPatchFromText: vi.fn(async (input: { plan: unknown; userText: string }) => ({
    patch: state.planner!(input),
    usage: { cost: 0.0012 },
    requestId: `req-${crypto.randomUUID()}`,
  })),
}));
vi.mock("@/lib/email", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: vi.fn(async () => ({ preview: true })),
}));

describe.skipIf(!testUrl)("commercial flows on PostgreSQL", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  const marker = crypto.randomUUID().slice(0, 8);
  let owner: User;
  let member: User;
  let outsider: User;
  let orgId: string;
  let slug: string;
  let todo: string;
  let done: string;
  let cardA: string;
  let cardB: string;
  const action = (overrides: Record<string, unknown>) => ({
    action: "move",
    cardId: null,
    title: null,
    description: null,
    targetColumnId: null,
    priority: null,
    dueDate: null,
    tags: null,
    reason: "test",
    ...overrides,
  });
  const req = (path: string, method = "GET", body?: unknown) =>
    new Request(`http://localhost${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

  beforeAll(async () => {
    process.env.OPENROUTER_API_KEY = "synthetic";
    ({ prisma } = await import("@/lib/prisma"));
    const mk = (name: string, verified = true) =>
      prisma.user.create({
        data: {
          name,
          email: `${name.toLowerCase()}-${marker}@example.invalid`,
          passwordHash: "TEST_ONLY",
          emailVerifiedAt: verified ? new Date() : null,
        },
      });
    owner = await mk("Owner");
    member = await mk("Member");
    outsider = await mk("Outsider");
    const org = await prisma.organization.create({
      data: {
        name: `Org ${marker}`,
        slug: `org-${marker}`,
        plan: "TEAM",
        seats: 2,
        licenseSource: "MANUAL",
        createdById: owner.id,
        members: {
          create: [
            { userId: owner.id, role: "OWNER" },
            { userId: member.id, role: "MEMBER" },
          ],
        },
      },
    });
    orgId = org.id;
    slug = `board-${marker}`;
    const workspace = await prisma.workspace.create({
      data: {
        name: "Board",
        slug,
        organizationId: orgId,
        createdById: owner.id,
        members: {
          create: [
            { userId: owner.id, role: "OWNER" },
            { userId: member.id, role: "MEMBER" },
          ],
        },
      },
    });
    todo = (await prisma.boardColumn.create({ data: { workspaceId: workspace.id, title: "Da fare", position: 0 } })).id;
    done = (await prisma.boardColumn.create({ data: { workspaceId: workspace.id, title: "Fatto", position: 1 } })).id;
    cardA = (await prisma.card.create({ data: { workspaceId: workspace.id, columnId: todo, title: "Newsletter", position: 0 } })).id;
    cardB = (await prisma.card.create({ data: { workspaceId: workspace.id, columnId: todo, title: "Preventivo", position: 1 } })).id;
  });
  beforeEach(() => {
    state.user = owner;
  });
  afterAll(async () => {
    await prisma?.organization.deleteMany({ where: { slug: { contains: marker } } });
    await prisma?.user.deleteMany({ where: { email: { contains: marker } } });
    await prisma?.$disconnect();
  });

  it("AI updates are previewed, applied only on confirmation, idempotent and undoable", async () => {
    const { POST: ingest } = await import("@/app/api/workspaces/[slug]/ingest/route");
    const { POST: apply } = await import("@/app/api/workspaces/[slug]/proposals/[proposalId]/apply/route");
    const { POST: undo } = await import("@/app/api/workspaces/[slug]/updates/[updateId]/undo/route");
    state.planner = () => ({
      summary: "Newsletter fatta",
      actions: [action({ cardId: cardA, targetColumnId: done })],
      clarification: null,
    });
    const proposed = await ingest(req(`/api/workspaces/${slug}/ingest`, "POST", { text: "Ho finito la newsletter" }), params({ slug }));
    expect(proposed.status).toBe(200);
    const { proposal } = await proposed.json();
    expect(proposal.actions[0]).toMatchObject({ action: "move", cardTitle: "Newsletter", fromColumn: "Da fare", toColumn: "Fatto" });
    expect((await prisma.card.findUniqueOrThrow({ where: { id: cardA } })).columnId).toBe(todo);
    const first = await (await apply(req("/x", "POST", {}), params({ slug, proposalId: proposal.id }))).json();
    const again = await apply(req("/x", "POST", {}), params({ slug, proposalId: proposal.id }));
    expect((await again.json()).receipt).toEqual(first.receipt);
    expect((await prisma.card.findUniqueOrThrow({ where: { id: cardA } })).columnId).toBe(done);
    expect(await prisma.updateLog.count({ where: { id: first.receipt.updateId } })).toBe(1);
    const undone = await undo(req("/x", "POST", {}), params({ slug, updateId: first.receipt.updateId }));
    expect(undone.status).toBe(200);
    expect((await prisma.card.findUniqueOrThrow({ where: { id: cardA } })).columnId).toBe(todo);
  });

  it("applies only the selected actions and refuses stale proposals", async () => {
    const { POST: ingest } = await import("@/app/api/workspaces/[slug]/ingest/route");
    const { POST: apply } = await import("@/app/api/workspaces/[slug]/proposals/[proposalId]/apply/route");
    const { PATCH: patchCard } = await import("@/app/api/workspaces/[slug]/cards/[cardId]/route");
    state.planner = () => ({
      summary: "Due cose",
      actions: [action({ cardId: cardA, targetColumnId: done }), action({ action: "update", cardId: cardB, priority: "URGENT" })],
      clarification: null,
    });
    const { proposal } = await (await ingest(req("/x", "POST", { text: "due cose" }), params({ slug }))).json();
    const result = await apply(req("/x", "POST", { actionIndexes: [1] }), params({ slug, proposalId: proposal.id }));
    expect((await result.json()).receipt).toMatchObject({ applied: 1, skipped: 1 });
    expect((await prisma.card.findUniqueOrThrow({ where: { id: cardA } })).columnId).toBe(todo);
    expect((await prisma.card.findUniqueOrThrow({ where: { id: cardB } })).priority).toBe("URGENT");

    const next = await (await ingest(req("/x", "POST", { text: "sposta" }), params({ slug }))).json();
    const version = (await prisma.card.findUniqueOrThrow({ where: { id: cardA } })).version;
    expect((await patchCard(req("/x", "PATCH", { title: "Newsletter Q4", version }), params({ slug, cardId: cardA }))).status).toBe(200);
    const stale = await apply(req("/x", "POST", {}), params({ slug, proposalId: next.proposal.id }));
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe("PROPOSAL_STALE");
  });

  it("asks for clarification instead of guessing", async () => {
    const { POST: ingest } = await import("@/app/api/workspaces/[slug]/ingest/route");
    state.planner = () => ({
      summary: "",
      actions: [],
      clarification: { question: "Quale card?", options: ["Newsletter Q4", "Preventivo"] },
    });
    const { proposal } = await (await ingest(req("/x", "POST", { text: "ho finito" }), params({ slug }))).json();
    expect(proposal.actions).toEqual([]);
    expect(proposal.clarification.options).toHaveLength(2);
  });

  it("uses per-card optimistic concurrency: different cards never conflict, the same card does", async () => {
    const { PATCH: patchCard } = await import("@/app/api/workspaces/[slug]/cards/[cardId]/route");
    const a = await prisma.card.findUniqueOrThrow({ where: { id: cardA } });
    const b = await prisma.card.findUniqueOrThrow({ where: { id: cardB } });
    state.user = member;
    const [first, other] = await Promise.all([
      patchCard(req("/x", "PATCH", { description: "da Member", version: a.version }), params({ slug, cardId: cardA })),
      patchCard(req("/x", "PATCH", { description: "altra card", version: b.version }), params({ slug, cardId: cardB })),
    ]);
    expect([first.status, other.status]).toEqual([200, 200]);
    state.user = owner;
    const conflict = await patchCard(req("/x", "PATCH", { description: "da Owner", version: a.version }), params({ slug, cardId: cardA }));
    expect(conflict.status).toBe(409);
    const body = await conflict.json();
    expect(body.code).toBe("CARD_CONFLICT");
    expect(body.card.description).toBe("da Member");
    // A move by someone else never collides with a text edit.
    expect((await patchCard(req("/x", "PATCH", { columnId: done, index: 0 }), params({ slug, cardId: cardA }))).status).toBe(200);
  });

  it("reserves AI updates atomically and falls back to credit packs", async () => {
    const { reserveAiUpdate, QuotaExceededError, getUsageStatus } = await import("@/lib/plans");
    const trial = await prisma.organization.create({
      data: {
        name: "Trial",
        slug: `trial-${marker}`,
        plan: "TRIAL",
        trialEndsAt: new Date(Date.now() + 5 * 86400000),
        createdById: owner.id,
      },
    });
    await prisma.usageEvent.createMany({
      data: Array.from({ length: 149 }, () => ({
        organizationId: trial.id,
        category: "AI_UPDATE",
        model: "m",
        costUsd: 0,
        units: 1,
        periodKey: "x",
      })),
    });
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => reserveAiUpdate({ organizationId: trial.id, category: "AI_UPDATE", model: "m" })),
    );
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected" && result.reason instanceof QuotaExceededError)).toHaveLength(3);
    await prisma.organization.update({ where: { id: trial.id }, data: { plan: "PRO", trialEndsAt: null, licenseSource: "MANUAL" } });
    await prisma.usageEvent.createMany({
      data: Array.from({ length: 800 }, () => ({
        organizationId: trial.id,
        category: "AI_UPDATE",
        model: "m",
        costUsd: 0,
        units: 1,
        periodKey: new Date().toISOString().slice(0, 7),
      })),
    });
    await prisma.creditGrant.create({ data: { organizationId: trial.id, units: 2, remaining: 2, source: "TEST" } });
    await reserveAiUpdate({ organizationId: trial.id, category: "AI_UPDATE", model: "m" });
    await reserveAiUpdate({ organizationId: trial.id, category: "AI_UPDATE", model: "m" });
    await expect(reserveAiUpdate({ organizationId: trial.id, category: "AI_UPDATE", model: "m" })).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    expect((await getUsageStatus(trial.id))?.status).toBe("PAUSED");
  });

  it("gives the AI update back when the provider is down", async () => {
    const { POST: ingest } = await import("@/app/api/workspaces/[slug]/ingest/route");
    const { AiProviderError } = await import("@/lib/openrouter");
    const before = await prisma.usageEvent.count({ where: { organizationId: orgId, units: 1 } });
    state.planner = () => {
      throw new AiProviderError();
    };
    const response = await ingest(req("/x", "POST", { text: "qualcosa" }), params({ slug }));
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("AI_UNAVAILABLE");
    expect(await prisma.usageEvent.count({ where: { organizationId: orgId, units: 1 } })).toBe(before);
  });

  it("enforces paid seats, lets guests in for free, and limits guests to reading and commenting", async () => {
    const { POST: invite } = await import("@/app/api/workspaces/[slug]/invites/route");
    const { POST: accept } = await import("@/app/api/invites/accept/route");
    const { POST: createCard } = await import("@/app/api/workspaces/[slug]/cards/route");
    const { POST: comment } = await import("@/app/api/workspaces/[slug]/cards/[cardId]/comments/route");
    const full = await invite(req("/x", "POST", { email: outsider.email, role: "MEMBER" }), params({ slug }));
    expect(full.status).toBe(402);
    const guestInvite = await invite(req("/x", "POST", { email: outsider.email, role: "GUEST" }), params({ slug }));
    expect(guestInvite.status).toBe(201);
    const { inviteUrl } = await guestInvite.json();
    const token = new URL(inviteUrl).searchParams.get("token");
    state.user = outsider;
    expect((await accept(req("/x", "POST", { token }))).status).toBe(200);
    expect(await prisma.organizationMember.count({ where: { organizationId: orgId, role: { not: "GUEST" } } })).toBe(2);
    expect((await createCard(req("/x", "POST", { columnId: todo, title: "Da ospite" }), params({ slug }))).status).toBe(403);
    const posted = await comment(
      req("/x", "POST", { body: `Domanda per @Member`, mentions: [member.id] }),
      params({ slug, cardId: cardB }),
    );
    expect(posted.status).toBe(201);
    expect(await prisma.notification.count({ where: { userId: member.id, type: "MENTIONED" } })).toBe(1);
  });

  it("imports a CSV, creating missing columns", async () => {
    const { POST: importRoute } = await import("@/app/api/workspaces/[slug]/import/route");
    const csv =
      'titolo;colonna;priorità;scadenza;tag\nFoto catalogo;In attesa;alta;30/09/2026;foto|cliente\n"Riga; con separatore";Da fare;;;\n';
    const response = await importRoute(req("/x", "POST", { format: "csv", content: csv }), params({ slug }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ createdCards: 2, createdColumns: 1 });
    const imported = await prisma.card.findFirstOrThrow({ where: { title: "Foto catalogo", workspace: { slug } } });
    expect(imported).toMatchObject({ priority: "HIGH", tags: ["foto", "cliente"] });
  });

  it("freezes a lapsed team: reads and exports keep working, writes are refused", async () => {
    const { POST: createCard } = await import("@/app/api/workspaces/[slug]/cards/route");
    const { GET: exportBoard } = await import("@/app/api/workspaces/[slug]/export/route");
    await prisma.organization.update({ where: { id: orgId }, data: { readOnlyAt: new Date() } });
    try {
      expect((await createCard(req("/x", "POST", { columnId: todo, title: "Bloccata" }), params({ slug }))).status).toBe(423);
      const csv = await exportBoard(req(`/api/workspaces/${slug}/export?format=csv`), params({ slug }));
      expect(csv.status).toBe(200);
      expect(await csv.text()).toContain("Preventivo");
    } finally {
      await prisma.organization.update({ where: { id: orgId }, data: { readOnlyAt: null } });
    }
  });

  it("verifies TOTP codes once and accepts single-use recovery codes", async () => {
    const { encryptSecret } = await import("@/lib/crypto");
    const { generateRecoveryCodes, generateTotpSecret, totpAt, currentStep } = await import("@/lib/totp");
    const { checkUserCode } = await import("@/lib/two-factor");
    const secret = generateTotpSecret();
    const { codes, hashes } = generateRecoveryCodes(2);
    const user = await prisma.user.update({
      where: { id: member.id },
      data: { totpSecretEnc: encryptSecret(secret), totpEnabledAt: new Date(), totpRecoveryCodes: hashes, totpLastStep: null },
    });
    const code = totpAt(secret, currentStep());
    expect(await checkUserCode(user, code)).toBe(true);
    expect(await checkUserCode(await prisma.user.findUniqueOrThrow({ where: { id: member.id } }), code)).toBe(false);
    expect(await checkUserCode(await prisma.user.findUniqueOrThrow({ where: { id: member.id } }), codes[0])).toBe(true);
    expect(await checkUserCode(await prisma.user.findUniqueOrThrow({ where: { id: member.id } }), codes[0])).toBe(false);
  });

  it("rate limits through the shared database store", async () => {
    const { rateLimit } = await import("@/lib/security");
    const key = `test:${marker}`;
    expect(await rateLimit(key, 2, 60_000)).toBeNull();
    expect(await rateLimit(key, 2, 60_000)).toBeNull();
    expect((await rateLimit(key, 2, 60_000))?.status).toBe(429);
  });

  it("freezes finished trials without deletion and removes unverified accounts only after 7 days", async () => {
    const { runAccountEmailLifecycle } = await import("@/lib/lifecycle");
    const expired = await prisma.organization.create({
      data: {
        name: "Old trial",
        slug: `oldtrial-${marker}`,
        plan: "TRIAL",
        trialEndsAt: new Date(Date.now() - 86400000),
        createdById: owner.id,
      },
    });
    const stale = await prisma.user.create({
      data: { name: "Stale", email: `stale-${marker}@example.invalid`, passwordHash: "x", createdAt: new Date(Date.now() - 8 * 86400000) },
    });
    const recent = await prisma.user.create({
      data: {
        name: "Recent",
        email: `recent-${marker}@example.invalid`,
        passwordHash: "x",
        createdAt: new Date(Date.now() - 3 * 86400000),
      },
    });
    await runAccountEmailLifecycle(new Request("http://localhost/api/cron/retention"));
    const frozen = await prisma.organization.findUniqueOrThrow({ where: { id: expired.id } });
    expect(frozen.readOnlyAt).not.toBeNull();
    expect(frozen.deleteAfter).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });

  it("keeps column order dense when cards are placed", async () => {
    const { placeCard } = await import("@/lib/board");
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { slug } });
    await prisma.$transaction(async tx => {
      await placeCard(tx, workspace.id, todo, cardB, 0);
    });
    const cards = await prisma.card.findMany({ where: { columnId: todo, archived: false }, orderBy: { position: "asc" } });
    expect(cards[0].id).toBe(cardB);
    expect(cards.map(card => card.position)).toEqual(cards.map((_, index) => index));
  });
});

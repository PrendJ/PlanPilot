import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: {} as any, reserve: vi.fn(), refund: vi.fn(), usage: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/plans", () => ({ reserveAiUpdate: mocks.reserve, refundAiUpdate: mocks.refund, recordUsage: mocks.usage }));
vi.mock("@/lib/workspace", () => ({ getWorkspaceApiKey: () => "synthetic-key" }));
vi.mock("@/lib/platform-ai", () => ({ platformModels: async () => ({ planModel: "openai/gpt-5-nano", complexPlanModel: "openai/gpt-5-mini", transcriptionModel: "voice" }) }));
vi.mock("@/lib/board", () => ({ markMilestone: vi.fn() }));
vi.mock("@/lib/product-events", () => ({ trackEvent: vi.fn() }));
import { createProposal, previewActions } from "@/lib/ai-proposals";

const input = {
  workspace: { id: "board", name: "Test", slug: "test", organizationId: "org", openrouterKeyEnv: "", locale: "it" },
  userId: "user", text: "Crea il preventivo", source: "voice" as const,
};
const patch = { summary: "Creo il preventivo", clarification: null, actions: [{ action: "create", cardId: null, title: "Preventivo", description: null, targetColumnId: "todo", priority: null, dueDate: null, tags: null, reason: "Richiesto" }] };
function success() {
  return new Response(JSON.stringify({ id: "gen-test", choices: [{ message: { content: JSON.stringify(patch) } }], usage: { cost: 0.002 } }));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.db.boardColumn = { findMany: vi.fn().mockResolvedValue([{ id: "todo", title: "Da fare", description: "", cards: [] }]) };
  mocks.db.workspace = { findUniqueOrThrow: vi.fn().mockResolvedValue({ revision: 1 }) };
  mocks.db.aiProposal = { create: vi.fn(async ({ data }: any) => ({ ...data, id: "proposal", status: "PENDING" })) };
  mocks.reserve.mockResolvedValue({ id: "reservation" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("planning proposals with model tiers", () => {
  it("recovers the user's DNS reminder from an invalid date and accounts for both generations with one update", async () => {
    const dns = { ...patch, actions: [{ ...patch.actions[0], title: "Chiamare Sara NUSDV per settare il DNS", dueDate: "2026-10-23T18:00:00+02:00" }] };
    const completion = (value: unknown, id: string, cost: number) => new Response(JSON.stringify({ id,
      choices: [{ message: { content: JSON.stringify(value) } }], usage: { cost } }));
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(completion({ ...dns, actions: [{ ...dns.actions[0], dueDate: "2026-10-23" }] }, "gen-invalid", 0.0001))
      .mockResolvedValueOnce(completion(dns, "gen-corrected", 0.002)));
    const proposal = await createProposal({ ...input, text: "Oggi devo chiamare Sara NUSDV per settare il DNS", source: "text", now: new Date("2026-10-23T09:00:00+02:00") });
    expect(proposal.actions[0].newTitle).toBe("Chiamare Sara NUSDV per settare il DNS");
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.usage).toHaveBeenCalledTimes(2);
    expect(mocks.usage).toHaveBeenNthCalledWith(1, expect.objectContaining({ model: "openai/gpt-5-nano", providerRequestId: "gen-invalid", costUsd: 0.0001 }));
    expect(mocks.usage).toHaveBeenNthCalledWith(2, expect.objectContaining({ model: "openai/gpt-5-mini", providerRequestId: "gen-corrected", costUsd: 0.002 }));
    expect(mocks.db.aiProposal.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ model: "openai/gpt-5-mini" }) }));
    expect(mocks.refund).not.toHaveBeenCalled();
  });
  it("refunds one update when both models return invalid schema and never stores a proposal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: crypto.randomUUID(),
      choices: [{ message: { content: JSON.stringify({ ...patch, actions: [{ ...patch.actions[0], dueDate: "today" }] }) } }], usage: { cost: 0.0001 } }))));
    await expect(createProposal(input)).rejects.toMatchObject({ message: "AI_INVALID_PATCH", diagnosticId: expect.any(String) });
    expect(mocks.refund).toHaveBeenCalledExactlyOnceWith("reservation");
    expect(mocks.usage).toHaveBeenCalledTimes(2);
    expect(mocks.db.aiProposal.create).not.toHaveBeenCalled();
  });
  it("records the effective fallback model, cost and request ID and reserves just one update", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 }))
      .mockResolvedValueOnce(success()));
    const proposal = await createProposal(input);
    expect(proposal.actions).toHaveLength(1);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.usage).toHaveBeenCalledWith(expect.objectContaining({ model: "openai/gpt-5-mini", costUsd: 0.002, providerRequestId: "gen-test" }));
    expect(mocks.db.aiProposal.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ model: "openai/gpt-5-mini", cost: 0.002 }) }));
    expect(mocks.refund).not.toHaveBeenCalled();
  });
  it("uses Mini immediately for long updates", async () => {
    const fetcher = vi.fn().mockResolvedValue(success());
    vi.stubGlobal("fetch", fetcher);
    await createProposal({ ...input, text: "Crea il preventivo con tutti i dettagli. ".repeat(40) });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe("openai/gpt-5-mini");
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ model: "openai/gpt-5-mini" }));
  });
  it("refunds the update and creates no proposal when both providers fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 503 } }), { status: 503 })));
    await expect(createProposal(input)).rejects.toThrow("AI_UNAVAILABLE");
    expect(mocks.refund).toHaveBeenCalledExactlyOnceWith("reservation");
    expect(mocks.usage).not.toHaveBeenCalled();
    expect(mocks.db.aiProposal.create).not.toHaveBeenCalled();
  });
});

describe("planning proposals reconciled with the board", () => {
  it("places the reported DNS task in the first open column when the model omits the column", async () => {
    mocks.db.boardColumn.findMany.mockResolvedValue([
      { id: "done-first", title: "Fatto", description: "", semanticKey: "DONE", cards: [] },
      { id: "todo", title: "Da fare", description: "", semanticKey: "READY", cards: [] },
      { id: "archive", title: "Archivio", description: "", semanticKey: "CUSTOM", cards: [] },
    ]);
    const dns = { ...patch, actions: [{ ...patch.actions[0], title: "Chiamare Sara NUSDV per settare il DNS", targetColumnId: null }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "gen", choices: [{ message: { content: JSON.stringify(dns) } }], usage: { cost: 0.001 } }))));
    const proposal = await createProposal({ ...input, text: "Oggi devo chiamare Sara NUSDV per settare il DNS", source: "text" });
    expect(proposal.actions[0]).toMatchObject({ action: "create", newTitle: "Chiamare Sara NUSDV per settare il DNS", toColumn: "Da fare" });
    expect(mocks.refund).not.toHaveBeenCalled();
  });
  it("refunds the update and stores nothing when both models reference a card that is not on the board", async () => {
    const invented = { ...patch, actions: [{ ...patch.actions[0], action: "update", cardId: "invented", priority: "HIGH" }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: crypto.randomUUID(), choices: [{ message: { content: JSON.stringify(invented) } }], usage: { cost: 0.0001 } }))));
    await expect(createProposal(input)).rejects.toMatchObject({ message: "AI_INVALID_PATCH" });
    expect(mocks.refund).toHaveBeenCalledExactlyOnceWith("reservation");
    expect(mocks.db.aiProposal.create).not.toHaveBeenCalled();
  });
});


describe("editable proposal preview", () => {
  it("preserves the complete proposed text and tags when editing an existing card", () => {
    const description = "Dettagli ".repeat(40);
    const action = { ...patch.actions[0], action: "update" as const, cardId: "card", title: null, description, tags: ["nuovo"], targetColumnId: null };
    const board = { columns: [{ id: "todo", title: "Da fare", cards: [{ id: "card", title: "Titolo originale", description: "Prima", priority: "NORMAL", dueDate: null, tags: ["vecchio"], version: 1, columnId: "todo" }] }] };
    expect(previewActions([action], board)[0].editable).toEqual({ title: "Titolo originale", description, tags: ["nuovo"] });
  });
});

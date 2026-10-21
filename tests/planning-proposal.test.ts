import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: {} as any, reserve: vi.fn(), refund: vi.fn(), usage: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/plans", () => ({ reserveAiUpdate: mocks.reserve, refundAiUpdate: mocks.refund, recordUsage: mocks.usage }));
vi.mock("@/lib/workspace", () => ({ getWorkspaceApiKey: () => "synthetic-key" }));
vi.mock("@/lib/platform-ai", () => ({ platformModels: async () => ({ planModel: "openai/gpt-5-nano", complexPlanModel: "openai/gpt-5-mini", transcriptionModel: "voice" }) }));
vi.mock("@/lib/board", () => ({ markMilestone: vi.fn() }));
vi.mock("@/lib/product-events", () => ({ trackEvent: vi.fn() }));
import { createProposal } from "@/lib/ai-proposals";

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

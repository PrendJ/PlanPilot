import { afterEach, describe, expect, it, vi } from "vitest";
import { planPatchFromText } from "@/lib/openrouter";

const input = { apiKey: "synthetic-key", model: "fixture-model", workspaceName: "Synthetic workspace", userText: "Nessuna modifica", plan: { columns: [] } };
afterEach(() => vi.unstubAllGlobals());

describe("OpenRouter adapter (fetch mocked, no live provider)", () => {
  it("requires ZDR and disables collection and fallback", async () => {
    const mocked = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "req_1", choices: [{ message: { content: JSON.stringify({ summary: "ok", actions: [] }) } }], usage: { cost: .001 } }) });
    vi.stubGlobal("fetch", mocked);
    await planPatchFromText(input);
    const body = JSON.parse(mocked.mock.calls[0][1].body);
    expect(body.provider).toEqual({ require_parameters: true, data_collection: "deny", zdr: true, allow_fallbacks: false });
    expect(body.messages[0].content).toContain("untrusted data");
  });
  it("AI-030 aborts with the configured deadline and does not retry", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(new DOMException("deadline", "TimeoutError")));
    const mocked = vi.fn(async (_url, options) => { options.signal.throwIfAborted(); });
    vi.stubGlobal("fetch", mocked);
    try {
      await expect(planPatchFromText(input)).rejects.toMatchObject({ name: "TimeoutError" });
      expect(timeout).toHaveBeenCalledWith(30_000);
      expect(mocked).toHaveBeenCalledTimes(1);
    } finally { timeout.mockRestore(); }
  });
  it.each(['{"actions":[', JSON.stringify({ summary: "ok", actions: [], execute_sql: "DROP TABLE cards" }), null])("AI-022/031 rejects truncated, unknown or empty output %#", async content => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) }));
    await expect(planPatchFromText(input)).rejects.toThrow();
  });
  it("does not expose provider diagnostics in errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Private provider diagnostic" } }) }));
    await expect(planPatchFromText(input)).rejects.toThrow("Il servizio AI non è disponibile");
  });
});

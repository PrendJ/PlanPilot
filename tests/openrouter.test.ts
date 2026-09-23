import { afterEach, describe, expect, it, vi } from "vitest";
import { planPatchFromText, referenceClock, systemPrompt } from "@/lib/openrouter";

const input = {
  apiKey: "synthetic-key",
  model: "fixture-model",
  workspaceName: "Synthetic workspace",
  userText: "Nessuna modifica",
  plan: { columns: [] },
};
afterEach(() => vi.unstubAllGlobals());

describe("OpenRouter adapter (fetch mocked, no live provider)", () => {
  it("routes only to zero-retention providers without data collection", async () => {
    const mocked = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "req_1",
        choices: [{ message: { content: JSON.stringify({ summary: "ok", actions: [] }) } }],
        usage: { cost: 0.001 },
      }),
    });
    vi.stubGlobal("fetch", mocked);
    await planPatchFromText(input);
    const body = JSON.parse(mocked.mock.calls[0][1].body);
    expect(body.provider).toEqual({
      require_parameters: true,
      data_collection: "deny",
      zdr: true,
      allow_fallbacks: true,
    });
    expect(body.reasoning).toBeUndefined();
    expect(mocked.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body.response_format.json_schema.schema.required).toContain("clarification");
    expect(body.messages[0].content).toContain("untrusted data");
  });
  it("AI-030 aborts with the configured deadline and does not retry", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(new DOMException("deadline", "TimeoutError")));
    const mocked = vi.fn(async (_url, options) => {
      options.signal.throwIfAborted();
    });
    vi.stubGlobal("fetch", mocked);
    try {
      await expect(planPatchFromText(input)).rejects.toThrow("AI_UNAVAILABLE");
      expect(timeout).toHaveBeenCalledWith(30_000);
      expect(mocked).toHaveBeenCalledTimes(1);
    } finally {
      timeout.mockRestore();
    }
  });
  it.each(['{"actions":[', JSON.stringify({ summary: "ok", actions: [], execute_sql: "DROP TABLE cards" }), null])(
    "AI-022/031 rejects truncated, unknown or empty output %#",
    async content => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) }));
      await expect(planPatchFromText(input)).rejects.toThrow();
    },
  );
  it("does not expose provider diagnostics in errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Private provider diagnostic" } }) }),
    );
    const error = await planPatchFromText(input).catch((caught: Error) => caught);
    expect(String(error)).toContain("AI_UNAVAILABLE");
    expect(String(error)).not.toContain("Private provider diagnostic");
  });
  it("resolves relative dates from the user's timezone", () => {
    const clock = referenceClock(new Date("2026-09-23T22:30:00Z"), "Europe/Rome");
    expect(clock).toMatchObject({ date: "2026-09-24", weekday: "Thursday", offset: "+02:00" });
    const prompt = systemPrompt({ now: new Date("2026-09-23T09:00:00Z"), timeZone: "Europe/Rome", locale: "it" });
    expect(prompt).toContain("Wednesday 2026-09-23");
    expect(prompt).toContain("clarification");
    expect(prompt).toContain("Return zero actions");
  });
  it("honours an allowlist, an EU base URL override, and refuses non-OpenRouter hosts", async () => {
    vi.stubEnv("AI_PROVIDER_ONLY", "mistral/eu, nebius");
    vi.stubEnv("OPENROUTER_BASE_URL", "https://evil.example.com/api/v1");
    const mocked = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "ok", actions: [], clarification: null }) } }] }),
    });
    vi.stubGlobal("fetch", mocked);
    try {
      await planPatchFromText(input);
      expect(mocked.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(JSON.parse(mocked.mock.calls[0][1].body).provider.only).toEqual(["mistral/eu", "nebius"]);
      vi.stubEnv("OPENROUTER_BASE_URL", "https://eu.openrouter.ai/api/v1");
      await planPatchFromText(input);
      expect(mocked.mock.calls[1][0]).toBe("https://eu.openrouter.ai/api/v1/chat/completions");
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("asks reasoning models for minimal effort", async () => {
    const mocked = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "ok", actions: [], clarification: null }) } }] }),
    });
    vi.stubGlobal("fetch", mocked);
    await planPatchFromText({ ...input, model: "openai/gpt-5-nano" });
    expect(JSON.parse(mocked.mock.calls[0][1].body).reasoning).toEqual({ effort: "minimal", exclude: true });
  });
});

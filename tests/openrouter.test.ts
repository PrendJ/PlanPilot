import { afterEach, describe, expect, it, vi } from "vitest";
import { planningResponseSchema, planPatchFromText, reconcilePatch, referenceClock, systemPrompt } from "@/lib/openrouter";

const input = {
  apiKey: "synthetic-key",
  model: "fixture-model",
  workspaceName: "Synthetic workspace",
  userText: "Nessuna modifica",
  plan: { columns: [] },
};
const dnsPatch = {
  summary: "Aggiungo la chiamata di oggi", actions: [{ action: "create", cardId: null,
    title: "Chiamare Sara NUSDV per settare il DNS", description: null, targetColumnId: "todo", priority: null,
    dueDate: "2026-10-23T18:00:00+02:00", tags: null, reason: "Attività richiesta per oggi" }], clarification: null,
};
const completion = (patch: unknown, id = "gen-test", cost = 0.001) => new Response(JSON.stringify({
  id, choices: [{ message: { content: JSON.stringify(patch) } }], usage: { cost },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("OpenRouter adapter (fetch mocked, no live provider)", () => {
  it("recovers from a date-only Nano response with Mini using the original DNS task and one deadline", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(completion({ ...dnsPatch, actions: [{ ...dnsPatch.actions[0], dueDate: "2026-10-23" }] }, "gen-nano", 0.0001))
      .mockResolvedValueOnce(completion(dnsPatch, "gen-mini", 0.002));
    const onUsage = vi.fn(async () => undefined);
    vi.stubGlobal("fetch", fetcher);
    const result = await planPatchFromText({ ...input, model: "openai/gpt-5-nano", fallbackModel: "openai/gpt-5-mini",
      userText: "Oggi devo chiamare Sara NUSDV per settare il DNS", diagnosticId: "dns-task-test", onUsage,
      now: new Date("2026-10-23T09:00:00+02:00") });
    expect(result).toMatchObject({ patch: dnsPatch, model: "openai/gpt-5-mini", requestId: "gen-mini" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [first, second] = fetcher.mock.calls.map(call => JSON.parse(call[1].body));
    expect(second.messages[1]).toEqual(first.messages[1]);
    expect(second.messages[0].content).toContain("previous attempt failed local output validation");
    expect(second.messages[0].content).toContain("actions.0.dueDate");
    expect(second.messages[0].content).not.toContain('"dueDate":"2026-10-23"');
    expect(second.provider).toEqual(first.provider);
    expect(fetcher.mock.calls[0][1].signal).toBe(fetcher.mock.calls[1][1].signal);
    expect(onUsage.mock.calls).toEqual([
      [{ model: "openai/gpt-5-nano", requestId: "gen-nano", usage: { cost: 0.0001 } }],
      [{ model: "openai/gpt-5-mini", requestId: "gen-mini", usage: { cost: 0.002 } }],
    ]);
  });
  it("constrains dates and bounded fields in the schema sent to the provider", async () => {
    const fetcher = vi.fn().mockResolvedValue(completion(dnsPatch));
    vi.stubGlobal("fetch", fetcher);
    await planPatchFromText(input);
    const schema = JSON.parse(fetcher.mock.calls[0][1].body).response_format.json_schema.schema;
    const fields = schema.properties.actions.items.properties;
    expect(fields.dueDate.anyOf).toEqual([{ type: "string", format: "date-time" }, { type: "string", enum: [""] }, { type: "null" }]);
    expect(fields.title.anyOf[0]).toMatchObject({ minLength: 1, maxLength: 180, pattern: "\\S" });
    expect(fields.tags.anyOf[0]).toMatchObject({ maxItems: 20, items: { maxLength: 40 } });
    expect(schema.properties.summary.maxLength).toBe(4000);
  });
  it("logs field paths and validator codes without logging rejected values or unknown keys", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion({ ...dnsPatch,
      private_field_from_board: "private-value", actions: [{ ...dnsPatch.actions[0], title: "private-title".repeat(20), dueDate: "private-date" }] })));
    await expect(planPatchFromText({ ...input, diagnosticId: "invalid-test" })).rejects.toMatchObject({ message: "AI_INVALID_PATCH", diagnosticId: "invalid-test" });
    expect(log).toHaveBeenCalledWith("OpenRouter planning failed", expect.objectContaining({
      phase: "schema", providerRequestId: "gen-test", validationIssues: expect.arrayContaining([
        { path: "actions.0.title", code: "too_big" },
        { path: "actions.0.dueDate", code: "invalid_format", validation: "datetime" },
        { path: "$", code: "unrecognized_keys" },
      ]),
    }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|private_field|Sara|NUSDV/);
  });
  it("retries malformed JSON once and rejects malformed fallback output", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"actions":[' } }] })));
    vi.stubGlobal("fetch", fetcher);
    await expect(planPatchFromText({ ...input, fallbackModel: "openai/gpt-5-mini" })).rejects.toThrow("AI_INVALID_PATCH");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not retry invalid output with the same model or an expired deadline", async () => {
    const fetcher = vi.fn().mockImplementation(async () => completion({ ...dnsPatch, actions: [{ ...dnsPatch.actions[0], dueDate: "today" }] }));
    vi.stubGlobal("fetch", fetcher);
    await expect(planPatchFromText({ ...input, fallbackModel: input.model })).rejects.toThrow("AI_INVALID_PATCH");
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    await expect(planPatchFromText({ ...input, fallbackModel: "openai/gpt-5-mini" })).rejects.toThrow("AI_INVALID_PATCH");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("falls back once to Mini for unavailable Nano endpoints, retaining policy and deadline", async () => {
    const mocked = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 404, message: "No endpoints" } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: "ok", actions: [], clarification: null }) } }], usage: { cost: 0.002 } }), { headers: { "x-generation-id": "gen-mini" } }));
    vi.stubGlobal("fetch", mocked);
    const result = await planPatchFromText({ ...input, model: "openai/gpt-5-nano", fallbackModel: "openai/gpt-5-mini", diagnosticId: "fallback-test" });
    expect(result).toMatchObject({ model: "openai/gpt-5-mini", requestId: "gen-mini", usage: { cost: 0.002 } });
    const requests = mocked.mock.calls.map(call => JSON.parse(call[1].body));
    expect(requests.map(body => body.model)).toEqual(["openai/gpt-5-nano", "openai/gpt-5-mini"]);
    expect(requests[1].reasoning).toEqual({ effort: "low", exclude: true });
    expect(requests[1].provider).toEqual(requests[0].provider);
    expect(requests[1]).not.toHaveProperty("temperature");
    expect(mocked.mock.calls[0][1].signal).toBe(mocked.mock.calls[1][1].signal);
  });
  it.each([400, 401, 402, 403, 429])("does not retry rejected requests with status %s", async status => {
    const mocked = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: status } }), { status }));
    vi.stubGlobal("fetch", mocked);
    await expect(planPatchFromText({ ...input, fallbackModel: "openai/gpt-5-mini" })).rejects.toThrow("AI_UNAVAILABLE");
    expect(mocked).toHaveBeenCalledTimes(1);
  });
  it("stops after the fallback fails", async () => {
    const mocked = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: { code: 503 } }), { status: 503 }));
    vi.stubGlobal("fetch", mocked);
    await expect(planPatchFromText({ ...input, fallbackModel: "openai/gpt-5-mini" })).rejects.toThrow("AI_UNAVAILABLE");
    expect(mocked).toHaveBeenCalledTimes(2);
  });
  it("does not retry when both tiers use the same model", async () => {
    const mocked = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 }));
    vi.stubGlobal("fetch", mocked);
    await expect(planPatchFromText({ ...input, fallbackModel: input.model })).rejects.toThrow("AI_UNAVAILABLE");
    expect(mocked).toHaveBeenCalledTimes(1);
  });
  it("rejects an error envelope even when HTTP status and content look successful", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 400 }, choices: [{ message: { content: JSON.stringify({ summary: "ok", actions: [] }) } }] }))));
    await expect(planPatchFromText(input)).rejects.toThrow("AI_UNAVAILABLE");
  });
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
    expect(body.response_format.json_schema.schema.properties.actions.items.properties.priority).toEqual({
      anyOf: [{ type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] }, { type: "null" }],
    });
    // Google Vertex rejects nullable type arrays with a bare 400 INVALID_ARGUMENT.
    expect(JSON.stringify(body.response_format)).not.toMatch(/"type":\[/);
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
      expect(timeout).toHaveBeenCalledWith(60_000);
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
  it("asks for one action per task instead of the smallest set, keeping each date with its own task", () => {
    const prompt = systemPrompt({ now: new Date("2026-10-25T09:00:00Z"), timeZone: "Europe/Rome", locale: "it" });
    expect(prompt).not.toContain("smallest");
    expect(prompt).toContain("exactly one action for each distinct task");
    expect(prompt).toContain("Never merge separate tasks into one card");
    expect(prompt).toContain("applies only to the task it refers to");
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
  it("never sends temperature to GPT-5 nano, which require_parameters would leave without endpoints", async () => {
    const mocked = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "ok", actions: [], clarification: null }) } }] }),
    });
    vi.stubGlobal("fetch", mocked);
    await planPatchFromText({ ...input, model: "openai/gpt-5-nano" });
    await planPatchFromText({ ...input, model: "google/gemini-3.1-flash-lite" });
    expect(JSON.parse(mocked.mock.calls[0][1].body)).not.toHaveProperty("temperature");
    expect(JSON.parse(mocked.mock.calls[1][1].body).temperature).toBe(0.1);
  });
  it("accepts structured output wrapped in a json code fence", async () => {
    const content = "```json\n" + JSON.stringify({ summary: "ok", actions: [], clarification: null }) + "\n```";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) }));
    await expect(planPatchFromText(input)).resolves.toMatchObject({ patch: { summary: "ok", actions: [] } });
  });
  it("correlates a provider rejection with the UI diagnostic id without exposing its message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 404, message: "No endpoints meet the requirements" } }), { status: 404 })));
    const error = await planPatchFromText({ ...input, diagnosticId: "diagnostic-123" }).catch((caught: Error) => caught) as Error;
    expect(error.message).toBe("AI_UNAVAILABLE");
    expect(error).toHaveProperty("diagnosticId", "diagnostic-123");
    expect(error.message).not.toContain("No endpoints");
    expect(log).toHaveBeenCalledWith("OpenRouter planning failed", expect.objectContaining({ diagnosticId: "diagnostic-123", model: input.model, status: 404, code: 404, phase: "response" }));
  });
  it("logs a safe network cause and logs invalid structured output", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } })).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "{broken" } }] }))));
    await expect(planPatchFromText(input)).rejects.toThrow("AI_UNAVAILABLE");
    await expect(planPatchFromText(input)).rejects.toThrow("AI_INVALID_PATCH");
    expect(log).toHaveBeenCalledWith("OpenRouter planning failed", expect.objectContaining({ causeCode: "ENOTFOUND", phase: "request" }));
    expect(log).toHaveBeenCalledWith("OpenRouter planning failed", expect.objectContaining({ status: "invalid_json", phase: "parse" }));
  });
  it("omits temperature for every curated GPT-5 model", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const mocked = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: "ok", actions: [], clarification: null }) } }] })));
    vi.stubGlobal("fetch", mocked);
    for (const model of ["openai/gpt-5-nano", "openai/gpt-5-mini"]) await planPatchFromText({ ...input, model });
    for (const [, options] of mocked.mock.calls) expect(JSON.parse(options.body)).not.toHaveProperty("temperature");
  });
  it("identifies Google's upstream schema rejection without logging the raw body", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const raw = JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: "response_schema.priority.enum: invalid null value; private prompt" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 400, message: "Provider returned error", metadata: { provider_name: "Google", raw } },
    }), { status: 400 })));
    await expect(planPatchFromText(input)).rejects.toThrow("AI_UNAVAILABLE");
    expect(log).toHaveBeenCalledWith("OpenRouter planning failed", expect.objectContaining({
      provider: "Google", upstreamCode: 400, upstreamStatus: "INVALID_ARGUMENT", reason: "invalid_enum_schema",
    }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("private prompt");
  });
});

describe("planning patch reconciled with the board (fetch mocked)", () => {
  const scope = {
    columnIds: ["todo", "doing", "done"],
    defaultColumnId: "todo",
    cards: [{ id: "bank", columnId: "todo", title: "Chiamare la banca", description: "", priority: "NORMAL", dueDate: null, tags: [] }],
  };
  const base = { action: "update", cardId: "bank", title: null, description: null, targetColumnId: null, priority: null, dueDate: null, tags: null, reason: "" };
  const plan = (actions: unknown[]) => ({ summary: "Aggiorno", actions, clarification: null });

  it("sends the exact card and column IDs as enums, so the model cannot invent one", async () => {
    const fetcher = vi.fn().mockResolvedValue(completion(plan([])));
    vi.stubGlobal("fetch", fetcher);
    await planPatchFromText({ ...input, scope });
    const fields = JSON.parse(fetcher.mock.calls[0][1].body).response_format.json_schema.schema.properties.actions.items.properties;
    expect(fields.cardId.anyOf).toEqual([{ type: "string", enum: ["bank"] }, { type: "null" }]);
    expect(fields.targetColumnId.anyOf).toEqual([{ type: "string", enum: ["todo", "doing", "done"] }, { type: "null" }]);
  });
  it("only allows null card IDs on an empty board", () => {
    const fields = planningResponseSchema({ columnIds: ["todo"], cards: [] }).schema.properties.actions.items.properties;
    expect(fields.cardId).toMatchObject({ type: "null" });
  });
  it("keeps the reported DNS task when the model leaves the new card without a column or with an empty card ID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion({ ...dnsPatch, actions: [{ ...dnsPatch.actions[0], cardId: "", targetColumnId: null }] })));
    const result = await planPatchFromText({ ...input, scope, userText: "Oggi devo chiamare Sara NUSDV per settare il DNS" });
    expect(result.patch.actions).toEqual([{ ...dnsPatch.actions[0], cardId: null, targetColumnId: "todo" }]);
  });
  it("turns a move that also edits fields into an update and drops values that repeat the card", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion(plan([
      { ...base, action: "move", targetColumnId: "doing", title: "Chiamare la banca", priority: "HIGH" },
    ]))));
    const { patch } = await planPatchFromText({ ...input, scope });
    expect(patch.actions).toEqual([{ ...base, action: "update", targetColumnId: "doing", priority: "HIGH" }]);
  });
  it("keeps a pure move a move and drops an update that changes nothing", () => {
    const moved = reconcilePatch(plan([{ ...base, targetColumnId: "done", priority: "NORMAL" }]) as never, scope);
    expect(moved).toEqual({ patch: plan([{ ...base, action: "move", targetColumnId: "done" }]), issues: [] });
    expect(reconcilePatch(plan([{ ...base, title: "Chiamare la banca", targetColumnId: "todo" }]) as never, scope).patch.actions).toEqual([]);
  });
  it("regenerates the whole patch with the fallback model when a card or column is unknown, never keeping part of it", async () => {
    const valid = plan([{ ...base, action: "move", targetColumnId: "done" }]);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(completion(plan([{ ...base, action: "move", targetColumnId: "done" }, { ...base, cardId: "invented", priority: "HIGH" }])))
      .mockResolvedValueOnce(completion(valid));
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await planPatchFromText({ ...input, model: "openai/gpt-5-nano", fallbackModel: "openai/gpt-5-mini", scope });
    expect(result).toMatchObject({ patch: valid, model: "openai/gpt-5-mini" });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).messages[0].content).toContain("unknown_card");
    expect(reconcilePatch(plan([{ ...base, targetColumnId: "elsewhere" }]) as never, scope).issues).toEqual([{ path: "actions.0.targetColumnId", code: "unknown_column" }]);
    expect(reconcilePatch(plan([{ ...base, priority: "HIGH" }, { ...base, priority: "LOW" }]) as never, scope).issues).toEqual([{ path: "actions.1.cardId", code: "duplicate_card" }]);
    expect(reconcilePatch(plan([{ ...dnsPatch.actions[0], cardId: "bank" }]) as never, scope).issues).toEqual([{ path: "actions.0.cardId", code: "existing_card_on_create" }]);
  });
});

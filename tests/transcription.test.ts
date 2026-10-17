import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "@/lib/transcription";

const input = { apiKey: "synthetic-key", model: "mistralai/voxtral-mini-transcribe", audio: Buffer.from("synthetic-audio"), format: "webm" as const, language: "it-IT", diagnosticId: "audio-diagnostic" };
const success = () => new Response(JSON.stringify({ text: "  Comprare il pane  ", usage: { cost: 0.001 } }), { headers: { "x-generation-id": "gen-audio" } });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("OpenRouter transcription", () => {
  it("uses the STT contract, normalizes language, and reads the generation header", async () => {
    const fetch = vi.fn().mockResolvedValue(success());
    vi.stubGlobal("fetch", fetch);
    await expect(transcribeAudio(input)).resolves.toMatchObject({ text: "Comprare il pane", model: input.model, requestId: "gen-audio", usage: { cost: 0.001 } });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(JSON.parse(options.body)).toMatchObject({ model: input.model, input_audio: { data: input.audio.toString("base64"), format: "webm" }, language: "it", provider: { zdr: true, data_collection: "deny" } });
  });
  it("falls back once after 404, preserving the allowlist, ZDR and the shared deadline", async () => {
    vi.stubEnv("AI_PROVIDER_ONLY", "mistral/eu,groq");
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 404, message: "No endpoints" } }), { status: 404 })).mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetch);
    const result = await transcribeAudio(input);
    expect(result.model).toBe("openai/whisper-large-v3-turbo");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].signal).toBe(fetch.mock.calls[1][1].signal);
    for (const [, options] of fetch.mock.calls) expect(JSON.parse(options.body).provider).toEqual({ only: ["mistral/eu", "groq"], zdr: true, data_collection: "deny", allow_fallbacks: true });
  });
  it.each([400, 401, 402, 429, 500])("does not retry HTTP %i and returns a diagnostic reference", async status => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: status, message: "Rejected" } }), { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(transcribeAudio(input)).rejects.toMatchObject({ message: "TRANSCRIPTION_FAILED", diagnosticId: "audio-diagnostic" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([" ", null, { error: "invalid" }])("rejects empty or malformed transcripts %#", async text => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ text }))));
    await expect(transcribeAudio(input)).rejects.toThrow("TRANSCRIPTION_FAILED");
  });
  it("does not loop if the fallback also returns 404", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response("Not found", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await expect(transcribeAudio(input)).rejects.toThrow("TRANSCRIPTION_FAILED");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not repeat Whisper when it is the selected model", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("Not found", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await expect(transcribeAudio({ ...input, model: "openai/whisper-large-v3-turbo" })).rejects.toThrow("TRANSCRIPTION_FAILED");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("logs network failure without the credentials or audio", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } })));
    await expect(transcribeAudio(input)).rejects.toThrow("TRANSCRIPTION_FAILED");
    expect(log).toHaveBeenCalledWith("OpenRouter transcription failed", expect.objectContaining({ diagnosticId: "audio-diagnostic", causeCode: "ENOTFOUND", phase: "request" }));
    expect(JSON.stringify(log.mock.calls)).not.toContain(input.apiKey);
    expect(JSON.stringify(log.mock.calls)).not.toContain(input.audio.toString("base64"));
  });
});

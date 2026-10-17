import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ context: vi.fn(), quota: vi.fn(), recordUsage: vi.fn(), trackEvent: vi.fn() }));
vi.mock("@/lib/api-context", () => ({ boardContext: mocks.context, isResponse: (value: unknown) => value instanceof NextResponse }));
vi.mock("@/lib/security", () => ({ rateLimit: async () => null }));
vi.mock("@/lib/workspace", () => ({ getWorkspaceApiKey: () => "synthetic-key" }));
vi.mock("@/lib/platform-ai", () => ({ platformModels: async () => ({ transcriptionModel: "mistralai/voxtral-mini-transcribe" }) }));
vi.mock("@/lib/plans", () => ({ getUsageStatus: mocks.quota, recordUsage: mocks.recordUsage }));
vi.mock("@/lib/product-events", () => ({ trackEvent: mocks.trackEvent }));
import { POST } from "../app/api/workspaces/[slug]/transcribe/route";

function request() {
  const body = new FormData();
  body.append("audio", new File(["synthetic-audio"], "recording.webm", { type: "audio/webm" }));
  return new Request("https://boardcue.test/api/workspaces/test/transcribe", { method: "POST", body });
}
const params = { params: Promise.resolve({ slug: "test" }) };
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.context.mockResolvedValue({ workspace: { id: "board", organizationId: "org", dictationEnabled: true, locale: "it" }, user: { id: "user" } });
  mocks.quota.mockResolvedValue({ status: "ACTIVE" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("dictation API", () => {
  it("returns editable text and bills the model actually used after a fallback", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "No endpoints", code: 404 } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "  Spedire il preventivo  ", usage: { cost: 0.0001 } }), { headers: { "x-generation-id": "gen-fallback" } })));
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "Spedire il preventivo" });
    expect(mocks.recordUsage).toHaveBeenCalledWith({ organizationId: "org", workspaceId: "board", userId: "user", providerRequestId: "gen-fallback", category: "TRANSCRIPTION", model: "openai/whisper-large-v3-turbo", costUsd: 0.0001 });
    expect(mocks.trackEvent).toHaveBeenCalledWith("dictation");
  });
  it("returns a diagnostic reference and never bills a failed transcription", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Private diagnostic" } }), { status: 401 })));
    const response = await POST(request(), params);
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toMatchObject({ code: "TRANSCRIPTION_FAILED", diagnosticId: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("Private diagnostic");
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { api, aiRequestError } from "@/components/ui";
import { translator } from "@/lib/i18n/core";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.restoreAllMocks(); });

describe("AI model prices and client error classification", () => {
  it("reads public prices per million tokens and ignores unlisted models", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: "openai/gpt-5-mini", pricing: { prompt: "0.00000025", completion: "0.000002" } },
      { id: "openai/gpt-5-nano", pricing: {} },
      { id: "unlisted/model", pricing: { prompt: "10", completion: "10" } },
    ] }))));
    const { publicModelPricing } = await import("@/lib/model-pricing");
    expect(await publicModelPricing()).toEqual({
      "openai/gpt-5-mini": { inputUsdPerMillion: 0.25, outputUsdPerMillion: 2, audioUsdPerMinute: null },
      "openai/gpt-5-nano": { inputUsdPerMillion: null, outputUsdPerMillion: null, audioUsdPerMinute: null },
    });
  });
  it("queries the separate STT catalogue and converts per-second prices to per-minute, never per-token", async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify({ data: url.includes("output_modalities=transcription") ? [
      { id: "openai/whisper-large-v3-turbo", pricing: { prompt: "0.00000333", completion: "0" } },
      { id: "mistralai/voxtral-mini-transcribe-3-0", pricing: { prompt: "0.0000583333", completion: "0" } },
      { id: "openai/whisper-large-v3", pricing: { prompt: " ", completion: "0" } },
    ] : [] })));
    vi.stubGlobal("fetch", fetcher);
    const { publicModelPricing } = await import("@/lib/model-pricing");
    const prices = await publicModelPricing();
    expect(prices["openai/whisper-large-v3-turbo"]).toEqual({ inputUsdPerMillion: null, outputUsdPerMillion: null, audioUsdPerMinute: 0.0001998 });
    expect(prices["mistralai/voxtral-mini-transcribe-3-0"].audioUsdPerMinute).toBeCloseTo(0.0035, 7);
    expect(prices["openai/whisper-large-v3"].audioUsdPerMinute).toBeNull();
    await publicModelPricing();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("keeps planning prices when only the STT catalogue fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("output_modalities")
      ? new Response("unavailable", { status: 503 })
      : new Response(JSON.stringify({ data: [{ id: "openai/gpt-5-nano", pricing: { prompt: "0.00000005", completion: "0.0000004" } }] }))));
    const { publicModelPricing } = await import("@/lib/model-pricing");
    expect((await publicModelPricing())["openai/gpt-5-nano"].inputUsdPerMillion).toBe(0.05);
  });
  it("keeps model selection available when public pricing fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    const { publicModelPricing } = await import("@/lib/model-pricing");
    expect(await publicModelPricing()).toEqual({});
  });
  it("shows a proxy response and a browser network error as distinct from a provider error", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("<html>Bad Gateway</html>", { status: 502 })).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const t = translator("it");
    const proxy = await api("/api/workspaces/synthetic/ingest", { method: "POST", json: { text: "synthetic" } });
    const network = await api("/api/workspaces/synthetic/ingest", { method: "POST", json: { text: "synthetic" } });
    expect(proxy.data.code).toBe("INVALID_RESPONSE");
    expect(network.data.code).toBe("NETWORK");
    expect(aiRequestError(proxy, t)).toBe(t("errors.SERVER_ERROR"));
    expect(aiRequestError(network, t)).toBe(t("errors.NETWORK"));
    expect(aiRequestError({ status: 502, data: { error: t("errors.AI_UNAVAILABLE"), diagnosticId: "12345678-long" } }, t)).toContain("ID 12345678");
  });
});

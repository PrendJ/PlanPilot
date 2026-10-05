import { afterEach, describe, expect, it, vi } from "vitest";
import { api, aiRequestError } from "@/components/ui";
import { translator } from "@/lib/i18n/core";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.restoreAllMocks(); });

describe("AI model prices and client error classification", () => {
  it("reads public prices per million tokens and ignores unlisted models", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: "google/gemini-2.5-flash-lite", pricing: { prompt: "0.0000001", completion: "0.0000004" } },
      { id: "openai/gpt-5-nano", pricing: {} },
      { id: "unlisted/model", pricing: { prompt: "10", completion: "10" } },
    ] }))));
    const { publicModelPricing } = await import("@/lib/model-pricing");
    expect(await publicModelPricing()).toEqual({
      "google/gemini-2.5-flash-lite": { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 },
      "openai/gpt-5-nano": { inputUsdPerMillion: null, outputUsdPerMillion: null },
    });
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

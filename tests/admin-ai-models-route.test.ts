import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/platform-access", () => ({ requirePlatform: mocks.access }));
vi.mock("@/lib/security", async original => ({ ...(await original<typeof import("@/lib/security")>()), rejectCrossOrigin: () => null }));
vi.mock("@/lib/platform-ai", async original => ({
  ...(await original<typeof import("@/lib/platform-ai")>()),
  setPlatformModels: mocks.save,
  platformModelOptionsWithPricing: async () => ({}),
}));
import { PATCH } from "@/app/api/admin/ai-models/route";
const settings = { planModel: "openai/gpt-5-nano", complexPlanModel: "openai/gpt-5-mini", transcriptionModel: "openai/whisper-large-v3" };
const request = (body: unknown) => new Request("https://boardcue.test/api/admin/ai-models", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ user: { id: "admin" } });
  mocks.save.mockResolvedValue(settings);
});
afterEach(() => vi.restoreAllMocks());
describe("admin model settings API", () => {
  it("saves both tiers only with the platform admin capability", async () => {
    expect((await PATCH(request(settings)))?.status).toBe(200);
    expect(mocks.access).toHaveBeenCalledWith("PLATFORM_ADMIN");
    expect(mocks.save).toHaveBeenCalledWith(settings, "admin");
  });
  it("rejects Gemini in either tier", async () => {
    for (const field of ["planModel", "complexPlanModel"]) {
      expect((await PATCH(request({ ...settings, [field]: "google/gemini-3.1-flash-lite" })))?.status).toBe(400);
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not save for a caller without the capability", async () => {
    mocks.access.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    expect((await PATCH(request(settings)))?.status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

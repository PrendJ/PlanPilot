import { afterEach, describe, expect, it, vi } from "vitest";
import { routeHomeCapture, validateRouting } from "@/lib/home-routing";

const boards = [
  { id: "home", name: "Casa" },
  { id: "work", name: "Lavoro" },
];

describe("home capture routing", () => {
  it("accepts exact excerpts across distinct boards", () => {
    const input = "Tagliare il prato. Preparare il preventivo.";
    expect(
      validateRouting(
        {
          segments: [
            { text: "Tagliare il prato.", workspaceId: "home" },
            { text: "Preparare il preventivo.", workspaceId: "work" },
          ],
        },
        input,
        boards,
      ),
    ).toEqual([
      { text: "Tagliare il prato.", workspaceId: "home" },
      { text: "Preparare il preventivo.", workspaceId: "work" },
    ]);
  });
  it("asks the user when routing invents an ID or drops any content", () => {
    const input = "Chiama la banca e ricorda le chiavi in garage";
    for (const segments of [
      [{ text: input, workspaceId: "other" }],
      [{ text: "Chiama la banca", workspaceId: "home" }],
      [{ text: "Chiama la banca e ricorda le chiavi", workspaceId: "home" }],
    ])
      expect(validateRouting({ segments }, input, boards)).toEqual([{ text: input, workspaceId: null }]);
  });
  it("routes with GPT-5 nano without sending temperature", async () => {
    const mocked = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ segments: [{ text: "Paga la bolletta", workspaceId: "home" }] }) } }],
      }),
    });
    vi.stubGlobal("fetch", mocked);
    const result = await routeHomeCapture({ text: "Paga la bolletta", boards, apiKey: "synthetic-key", model: "openai/gpt-5-nano" });
    expect(result.segments).toEqual([{ text: "Paga la bolletta", workspaceId: "home" }]);
    expect(JSON.parse(mocked.mock.calls[0][1].body)).not.toHaveProperty("temperature");
  });
});

afterEach(() => vi.unstubAllGlobals());

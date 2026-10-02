import { describe, expect, it } from "vitest";
import { validateRouting } from "@/lib/home-routing";

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
});

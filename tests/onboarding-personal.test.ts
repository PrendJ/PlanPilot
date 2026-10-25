import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/workspace", () => ({ createWorkspace: vi.fn(), normalizeLocale: (value: string) => value }));
const { isPersonalBoard } = await import("@/lib/onboarding");

describe("personal board offer", () => {
  it("recognises personal boards created before the PERSONAL preset, so the home stops offering a second one", () => {
    for (const name of ["Casa e personale", "Personale", "Home and personal", "Famiglia Rossi", "Cose private"])
      expect(isPersonalBoard({ presetKey: "GENERAL", name })).toBe(true);
    expect(isPersonalBoard({ presetKey: "PERSONAL", name: "Qualsiasi nome" })).toBe(true);
  });
  it("does not mistake work boards for personal ones", () => {
    for (const name of ["La mia prima board", "Homepage redesign", "Cliente Rossi", "Marketing Q4"])
      expect(isPersonalBoard({ presetKey: "GENERAL", name })).toBe(false);
  });
});

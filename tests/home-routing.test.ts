import { afterEach, describe, expect, it, vi } from "vitest";
import { ROUTING_PROMPT, routeHomeCapture, validateRouting } from "@/lib/home-routing";

const boards = [
  { id: "home", name: "Casa", kind: "personal" as const },
  { id: "work", name: "Lavoro", kind: "work" as const },
];
const reply = (value: unknown) => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) });
const bank = "Ricordami di chiamare la banca e di salvare il form entro stasera";

describe("home capture: one item per task, each on its board", () => {
  it("keeps the two tasks of the reported sentence apart, each with its own deadline and board", () => {
    const tasks = [
      { text: "Chiamare la banca", workspaceId: "home", newBoardName: null },
      { text: "Salvare il form entro stasera", workspaceId: "work", newBoardName: null },
    ];
    expect(validateRouting({ tasks }, bank, boards)).toEqual(tasks);
  });
  it("passes on a suggested new board only for tasks without a board", () => {
    expect(
      validateRouting(
        {
          tasks: [
            { text: "Prenotare il veterinario per Fido", workspaceId: null, newBoardName: "Animali" },
            { text: "Chiamare la banca", workspaceId: "home", newBoardName: "Ignorato" },
          ],
        },
        "x",
        boards,
      ),
    ).toEqual([
      { text: "Prenotare il veterinario per Fido", workspaceId: null, newBoardName: "Animali" },
      { text: "Chiamare la banca", workspaceId: "home", newBoardName: null },
    ]);
  });
  it("returns the whole text for a person to place when routing invents a board or is malformed", () => {
    const fallback = [{ text: bank, workspaceId: null, newBoardName: null }];
    expect(validateRouting({ tasks: [{ text: "Chiamare la banca", workspaceId: "other", newBoardName: null }] }, bank, boards)).toEqual(fallback);
    expect(validateRouting({ tasks: [] }, bank, boards)).toEqual(fallback);
    expect(validateRouting({ segments: [{ text: bank, workspaceId: "home" }] }, bank, boards)).toEqual(fallback);
  });
  it("tells the model to split sentences into tasks and keep each date with its task", () => {
    expect(ROUTING_PROMPT).toContain("One item per task");
    expect(ROUTING_PROMPT).toContain("a date or deadline belongs only to the task it refers to");
    expect(ROUTING_PROMPT).toContain("newBoardName");
  });
  it("routes with GPT-5 nano without sending temperature", async () => {
    const mocked = vi.fn().mockResolvedValue(reply({ tasks: [{ text: "Paga la bolletta", workspaceId: "home", newBoardName: null }] }));
    vi.stubGlobal("fetch", mocked);
    const result = await routeHomeCapture({ text: "Paga la bolletta", boards, apiKey: "synthetic-key", model: "openai/gpt-5-nano" });
    expect(result.segments).toEqual([{ text: "Paga la bolletta", workspaceId: "home", newBoardName: null }]);
    expect(JSON.parse(mocked.mock.calls[0][1].body)).not.toHaveProperty("temperature");
  });
  it("lets the model return only the person's board IDs, without exceeding the enum limit of strict schemas", async () => {
    const mocked = vi.fn().mockResolvedValue(reply({ tasks: [{ text: "x", workspaceId: null, newBoardName: null }] }));
    vi.stubGlobal("fetch", mocked);
    const item = (call: number) => JSON.parse(mocked.mock.calls[call][1].body).response_format.json_schema.schema.properties.tasks.items;
    await routeHomeCapture({ text: "x", boards, apiKey: "synthetic-key", model: "openai/gpt-5-nano" });
    expect(item(0).properties.workspaceId.anyOf[0]).toEqual({ type: "string", enum: ["home", "work"] });
    expect(item(0).required).toEqual(["text", "workspaceId", "newBoardName"]);
    const many = Array.from({ length: 600 }, (_, index) => ({ id: `board-${index}`, name: `Board ${index}` }));
    await routeHomeCapture({ text: "x", boards: many, apiKey: "synthetic-key", model: "openai/gpt-5-nano" });
    expect(item(1).properties.workspaceId.anyOf[0]).toEqual({ type: "string" });
  });
  it("skips the call with a single board: the planner splits the tasks there", async () => {
    const mocked = vi.fn();
    vi.stubGlobal("fetch", mocked);
    const result = await routeHomeCapture({ text: bank, boards: [boards[0]], apiKey: "synthetic-key", model: "openai/gpt-5-nano" });
    expect(result.segments).toEqual([{ text: bank, workspaceId: "home", newBoardName: null }]);
    expect(mocked).not.toHaveBeenCalled();
  });
});

afterEach(() => vi.unstubAllGlobals());

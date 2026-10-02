import { describe, expect, it } from "vitest";
import { routeDemoText, splitDemoText } from "@/lib/demo-router";
import { planDemoUpdate, type DemoCard, type DemoColumn } from "@/lib/demo-planner";

const card = (id: string, title: string, columnId = "todo"): DemoCard => ({
  id,
  title,
  description: "",
  columnId,
  priority: "NORMAL",
  dueDate: null,
  tags: [],
});
const boards = [
  { id: "work", kind: "work" as const, cards: [card("p", "Preventivo per Studio Rossi"), card("n", "Newsletter di ottobre", "doing")] },
  { id: "home", kind: "personal" as const, cards: [card("b", "Pagare la bolletta della luce")] },
];
const columns: DemoColumn[] = [
  { id: "todo", title: "Da fare", intent: "todo" },
  { id: "done", title: "Fatto", intent: "done" },
];

describe("demo home routing (local, no AI)", () => {
  it("splits separate instructions but keeps a single phrase whole", () => {
    expect(splitDemoText("Chiama la banca domani e prepara il preventivo per Studio Rossi entro venerdì")).toEqual([
      "Chiama la banca domani",
      "prepara il preventivo per Studio Rossi entro venerdì",
    ]);
    expect(splitDemoText("Sabato devo tagliare il prato; ho pagato la bolletta della luce")).toEqual([
      "Sabato devo tagliare il prato",
      "ho pagato la bolletta della luce",
    ]);
    expect(splitDemoText("Pane e latte")).toEqual(["Pane e latte"]);
  });

  it("sends personal and work excerpts to different boards and asks when unsure", () => {
    expect(routeDemoText("Chiama la banca domani e prepara il preventivo per Studio Rossi entro venerdì", boards)).toEqual([
      { text: "Chiama la banca domani", boardId: "home" },
      { text: "prepara il preventivo per Studio Rossi entro venerdì", boardId: "work" },
    ]);
    expect(routeDemoText("Devo organizzare la cena di fine anno", boards)).toEqual([
      { text: "Devo organizzare la cena di fine anno", boardId: null },
    ]);
  });

  it("marks a paid bill as done and keeps dates out of new titles", () => {
    expect(planDemoUpdate("ho pagato la bolletta della luce", boards[1].cards, columns).actions).toEqual([
      expect.objectContaining({ action: "move", cardId: "b", targetColumnId: "done" }),
    ]);
    const now = new Date("2026-10-01T09:00:00");
    expect(planDemoUpdate("Sabato devo tagliare il prato", [], columns, "it", now).actions[0]).toMatchObject({
      action: "create",
      title: "Tagliare il prato",
    });
    expect(planDemoUpdate("Chiama la banca domani", [], columns, "it", now).actions[0].title).toBe("Chiama la banca");
  });
});

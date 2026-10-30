import { describe, expect, it } from "vitest";
import { isDoneColumn, rememberedColumn, reopenColumn } from "@/lib/board-state";
const columns = [
  { id: "todo", title: "Da fare", semanticKey: "READY" },
  { id: "active", title: "In corso", semanticKey: "ACTIVE" },
  { id: "done", title: "Fatto", semanticKey: "DONE" },
  { id: "wait", title: "In attesa", semanticKey: "BLOCKED" },
];
describe("explicit completion and reopening", () => {
  it("never mistakes the last or only open column for completed work", () => {
    expect(isDoneColumn(columns[3], 3, 4)).toBe(false);
    expect(isDoneColumn(columns[0], 0, 1)).toBe(false);
    expect(isDoneColumn({ title: "Fatto", semanticKey: "CUSTOM" })).toBe(false);
    expect(isDoneColumn({ title: "Fatto" })).toBe(true);
  });
  it("remembers the actual previous column and survives moves between completed columns", () => {
    const previous = rememberedColumn(columns, "active", "done");
    expect(previous).toBe("active");
    expect(reopenColumn(columns, previous)?.id).toBe("active");
    expect(rememberedColumn([...columns, { id: "done2", title: "OK", semanticKey: "DONE" }], "done", "done2", previous)).toBe("active");
    expect(rememberedColumn(columns, "done", "active", previous)).toBeNull();
  });
  it("falls back to READY when the original column was deleted or became completed", () => {
    expect(reopenColumn(columns, "deleted")?.id).toBe("todo");
    expect(reopenColumn(columns, "done")?.id).toBe("todo");
    expect(reopenColumn([columns[2]], "deleted")).toBeUndefined();
  });
});

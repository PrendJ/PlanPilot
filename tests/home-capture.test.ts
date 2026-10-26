import { describe, expect, it } from "vitest";
import {
  cutImport,
  groupTasks,
  MAX_INPUT,
  MAX_TRANSCRIPT,
  recordingSeconds,
  speechMinutes,
  splitTranscript,
  taskRequests,
} from "@/lib/home-capture";
import { limitCaptureText } from "@/lib/telegram";

describe("home capture limits: nothing is cut silently", () => {
  it("translates the limits into minutes of speech", () => {
    expect(speechMinutes(MAX_INPUT)).toBe(13);
    expect(speechMinutes(MAX_TRANSCRIPT)).toBe(67);
  });
  it("stops dictation before the transcript would fill one request, and after 2 minutes at most", () => {
    expect(recordingSeconds(0)).toBe(120);
    expect(recordingSeconds(MAX_INPUT - 15 * 30)).toBe(30);
    expect(recordingSeconds(MAX_INPUT)).toBe(0);
    expect(recordingSeconds(MAX_INPUT + 500)).toBe(0);
  });
  it("splits long text into parts that each fit a request, keeping every character", () => {
    const text = Array.from({ length: 400 }, (_, index) => `Frase numero ${index} con un po' di contenuto.`).join(" ");
    const parts = splitTranscript(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every(part => part.length <= MAX_INPUT)).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
  });
  it("keeps the start of an oversized import and reports how much was left out", () => {
    expect(cutImport("breve")).toEqual({ content: "breve", cut: null });
    const long = `${"riga di testo\n".repeat(5000)}`;
    const { content, cut } = cutImport(long);
    expect(cut).toEqual({ total: long.length, kept: expect.any(Number) });
    expect(content.length).toBeLessThanOrEqual(MAX_TRANSCRIPT);
    expect(cut!.kept).toBeGreaterThan(MAX_TRANSCRIPT * 0.9);
  });
  it("marks a Telegram transcript that exceeds the ceiling instead of cutting it silently", () => {
    expect(limitCaptureText("ciao")).toBe("ciao");
    const marked = limitCaptureText("a".repeat(MAX_TRANSCRIPT + 10));
    expect(marked.length).toBeLessThanOrEqual(MAX_TRANSCRIPT);
    expect(marked).toContain("Trascrizione tagliata");
  });
  it("sends a board's tasks as a list, in more requests only when one would be too long", () => {
    expect(taskRequests(["Chiamare la banca"])).toEqual(["Chiamare la banca"]);
    expect(taskRequests(["Chiamare la banca", "Salvare il form entro stasera"])).toEqual(["- Chiamare la banca\n- Salvare il form entro stasera"]);
    expect(taskRequests(["a".repeat(30), "b".repeat(30), "c".repeat(30)], 70)).toEqual([`- ${"a".repeat(30)}\n- ${"b".repeat(30)}`, `- ${"c".repeat(30)}`]);
  });
});

describe("task review grouped by board", () => {
  const boards = [
    { id: "home", name: "Casa e personale" },
    { id: "work", name: "Lavoro" },
  ];
  it("shows each board once with its tasks, then proposed boards (same name = one board), then tasks to place", () => {
    const tasks = [
      { key: "1", text: "Chiamare la banca", workspaceId: "home" },
      { key: "2", text: "Preventivo Rossi", workspaceId: "work" },
      { key: "3", text: "Tagliare il prato", workspaceId: "home" },
      { key: "4", text: "Vaccino di Fido", workspaceId: null, newBoardName: "Animali" },
      { key: "5", text: "Comprare crocchette", workspaceId: null, newBoardName: "animali " },
      { key: "6", text: "Qualcosa di vago", workspaceId: null, newBoardName: null },
    ];
    const groups = groupTasks(tasks, boards);
    expect(groups.map(group => [group.kind, "name" in group ? group.name : "", group.tasks.map(task => task.key)])).toEqual([
      ["board", "Casa e personale", ["1", "3"]],
      ["board", "Lavoro", ["2"]],
      ["proposed", "Animali", ["4", "5"]],
      ["unassigned", "", ["6"]],
    ]);
  });
  it("treats a task pointing to an unknown board as still to place", () => {
    expect(groupTasks([{ key: "1", text: "x", workspaceId: "gone" }], boards)).toEqual([
      { kind: "unassigned", tasks: [{ key: "1", text: "x", workspaceId: "gone" }] },
    ]);
  });
});

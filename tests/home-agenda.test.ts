import { describe, expect, it } from "vitest";
import { groupHomeTasks, type HomeTask } from "@/lib/home-agenda";

const task = (id: string, dueDate: string | null, priority = "NORMAL"): HomeTask => ({
  id,
  dueDate,
  priority,
  title: id,
  board: "Work",
  slug: "work",
  column: "To do",
  columnId: "todo",
  doneColumnId: "done",
});
const local = (day: number, hour = 0) => new Date(2026, 9, day, hour).toISOString();

describe("home agenda", () => {
  it("keeps overdue, today and the next seven calendar days separate at midnight boundaries", () => {
    const result = groupHomeTasks(
      [
        task("overdue", local(27, 23)),
        task("today-start", local(28)),
        task("today-end", local(28, 23)),
        task("tomorrow", local(29)),
        task("day-seven", local(35, 23)),
        task("too-late", local(36)),
        task("undated", null),
        task("invalid", "invalid"),
      ],
      new Date(2026, 9, 28, 12),
    );
    expect(result.overdue.map(card => card.id)).toEqual(["overdue"]);
    expect(result.today.map(card => card.id)).toEqual(["today-start", "today-end"]);
    expect(result.upcoming.map(card => card.id)).toEqual(["tomorrow", "day-seven"]);
  });

  it("prioritizes the oldest overdue tasks and urgent tasks today without truncating the list", () => {
    const cards = Array.from({ length: 350 }, (_, i) => task(`task-${i}`, local(28)));
    cards.push(task("urgent", local(28, 20), "URGENT"), task("old", local(1)), task("recent", local(27), "URGENT"));
    const groups = groupHomeTasks(cards, new Date(2026, 9, 28));
    expect(groups.today).toHaveLength(351);
    expect(groups.today[0].id).toBe("urgent");
    expect(groups.overdue.map(card => card.id)).toEqual(["old", "recent"]);
    expect(cards[0].id).toBe("task-0");
  });

  it("moves tasks between groups when the day changes", () => {
    const cards = [task("today", local(28)), task("tomorrow", local(29))];
    const nextDay = groupHomeTasks(cards, new Date(2026, 9, 29));
    expect(nextDay.overdue.map(card => card.id)).toEqual(["today"]);
    expect(nextDay.today.map(card => card.id)).toEqual(["tomorrow"]);
    expect(nextDay.upcoming).toEqual([]);
  });

  it("uses local calendar dates over a daylight-saving transition", () => {
    // Run this suite with TZ=Europe/Berlin as well: the week contains a 25-hour day.
    const now = new Date(2026, 9, 24, 12);
    const groups = groupHomeTasks([task("last-day", local(31, 23)), task("outside", local(32))], now);
    expect(groups.upcoming.map(card => card.id)).toEqual(["last-day"]);
  });
});

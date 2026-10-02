import { describe, expect, it } from "vitest";
import { feedTokenHash, newFeedToken, renderCalendarFeed, validTimeZone } from "../lib/calendar-feed";

describe("private calendar feed", () => {
  it("uses unguessable one-time tokens and validates the user's time zone", () => {
    const first = newFeedToken();
    const second = newFeedToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
    expect(feedTokenHash(first)).not.toContain(first);
    expect(validTimeZone("Europe/Rome")).toBe(true);
    expect(validTimeZone("invalid/timezone")).toBe(false);
  });

  it("publishes a stable all-day event in the chosen time zone and escapes user text", () => {
    const feed = renderCalendarFeed(
      [
        {
          id: "card-1",
          title: "Call, bank; tomorrow",
          description: "line one\nline two",
          dueDate: new Date("2026-10-02T01:00:00Z"),
          updatedAt: new Date("2026-10-01T18:00:00Z"),
          workspace: { name: "Personal", slug: "personal" },
        },
      ],
      "America/Los_Angeles",
      "https://boardcue.example",
    );
    expect(feed).toContain("UID:card-1@boardcue");
    expect(feed).toContain("DTSTART;VALUE=DATE:20261001");
    expect(feed).toContain("DTEND;VALUE=DATE:20261002");
    expect(feed).toContain("SUMMARY:Call\\, bank\\; tomorrow");
    expect(feed).toContain("Personal\\nline one\\nline two");
    expect(feed).toContain("END:VCALENDAR\r\n");
  });

  const card = (overrides: Partial<Parameters<typeof renderCalendarFeed>[0][number]> = {}) => ({
    id: "card-1",
    title: "Title",
    description: "",
    dueDate: new Date("2026-10-02T10:00:00Z"),
    updatedAt: new Date("2026-10-01T18:00:00Z"),
    workspace: { name: "Personal", slug: "personal" },
    ...overrides,
  });
  const unfold = (feed: string) => feed.replaceAll("\r\n ", "");

  it("folds long multi-byte lines at 75 octets and unfolds back to the original", () => {
    const title = "Riunione è già fissata 🗓️ con l'ufficio àèìòù 👩‍💻 ".repeat(8).trim();
    const feed = renderCalendarFeed([card({ title })], "Europe/Rome", "https://boardcue.example");
    const lines = feed.split("\r\n");
    for (const line of lines) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(lines.filter(line => line.startsWith(" ")).length).toBeGreaterThan(2);
    expect(unfold(feed)).toContain(`\r\nSUMMARY:${title}\r\n`);
    expect(feed).not.toContain("�");
  });

  it("strips carriage returns from user text", () => {
    const feed = renderCalendarFeed([card({ title: "a\rb", description: "one\r\ntwo" })], "Europe/Rome", "https://boardcue.example");
    expect(feed).toContain("SUMMARY:ab\r\n");
    expect(feed).toContain("DESCRIPTION:Personal\\none\\ntwo\r\n");
    expect(feed.replaceAll("\r\n", "")).not.toContain("\r");
  });

  it("keeps URL as a URI value, stamps generation time and asks clients to refresh hourly", () => {
    const now = new Date("2026-10-02T08:30:15.123Z");
    const feed = unfold(renderCalendarFeed([card({ id: "c1" })], "Europe/Rome", "https://boardcue.example/x;y,z", now));
    expect(feed).toContain("URL:https://boardcue.example/x;y,z/app/personal?card=c1\r\n");
    expect(feed).not.toContain("\\;");
    expect(feed).toContain("DTSTAMP:20261002T083015Z\r\n");
    expect(feed).toContain("LAST-MODIFIED:20261001T180000Z\r\n");
    expect(feed).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n");
    expect(feed).toContain("X-PUBLISHED-TTL:PT1H\r\n");
    expect(feed.indexOf("REFRESH-INTERVAL")).toBeLessThan(feed.indexOf("BEGIN:VEVENT"));
  });
});

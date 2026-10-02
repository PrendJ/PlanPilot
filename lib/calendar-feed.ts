import { createHash, randomBytes } from "node:crypto";

export function newFeedToken() {
  return randomBytes(32).toString("base64url");
}

export function feedTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function validTimeZone(value: string) {
  if (value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function dateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part("year")}${part("month")}${part("day")}`;
}

function nextDate(value: string) {
  const date = new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8)) + 1));
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function escapeIcs(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;").replaceAll("\r", "");
}

/** URL is a URI value (RFC 5545 3.3.13): no TEXT escaping, only line breaks removed. */
function uriValue(value: string) {
  return value.replaceAll(/[\r\n]/g, "");
}

function fold(line: string) {
  const chunks: string[] = [];
  let current = "";
  for (const character of line) {
    if (Buffer.byteLength(current + character, "utf8") > 73) {
      chunks.push(current);
      current = ` ${character}`;
    } else current += character;
  }
  chunks.push(current);
  return chunks.join("\r\n");
}

export type CalendarCard = {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
  updatedAt: Date;
  workspace: { name: string; slug: string };
};

/** Read-only, all-day deadlines. Stable UID lets subscribers update an existing event. */
export function renderCalendarFeed(cards: CalendarCard[], timeZone: string, appOrigin: string, now = new Date()) {
  const stamp = (date: Date) =>
    date
      .toISOString()
      .replaceAll(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BoardCue//Due dates//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:BoardCue",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const card of cards) {
    const day = dateParts(card.dueDate, timeZone);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${card.id}@boardcue`,
      `DTSTAMP:${stamp(now)}`,
      `LAST-MODIFIED:${stamp(card.updatedAt)}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${nextDate(day)}`,
      `SUMMARY:${escapeIcs(card.title)}`,
      `DESCRIPTION:${escapeIcs(`${card.workspace.name}${card.description ? `\n${card.description.slice(0, 4000)}` : ""}`)}`,
      `URL:${uriValue(`${appOrigin}/app/${encodeURIComponent(card.workspace.slug)}?card=${encodeURIComponent(card.id)}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

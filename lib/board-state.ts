/** Column state shared by the board UI, the home "today" list and the calendar feed. Pure: safe on client and server. */
const DONE_TITLE = /\b(done|fatto|completat|consegnat|pubblicat|chius|erledigt|termin|hecho|complet|ukończ|zrobion|заверш|сделан)/i;
const SEMANTIC_TITLES: [string, RegExp][] = [
  ["DONE", DONE_TITLE],
  ["BLOCKED", /\b(in attesa|attesa|waiting|on hold|bloccat|blocked)/i],
  ["ACTIVE", /\b(in corso|in progress|doing|in lavorazione|wip)\b/i],
  ["READY", /\b(da fare|to ?do|todo|pronto|ready)\b/i],
  ["INBOX", /\b(inbox|backlog|idee|ideas)\b/i],
];

export function isDoneColumn(column: { title: string; semanticKey?: string | null }, index: number, total: number) {
  return column.semanticKey === "DONE" || index === total - 1 || DONE_TITLE.test(column.title);
}

/** Best-effort state for columns created by hand or imported, so cross-board views know what is finished or waiting. */
export function inferSemanticKey(title: string) {
  return SEMANTIC_TITLES.find(([, pattern]) => pattern.test(title))?.[0] || "CUSTOM";
}

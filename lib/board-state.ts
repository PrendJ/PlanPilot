/** Column state shared by the board UI, the home "today" list and the calendar feed. Pure: safe on client and server. */
const DONE_TITLE = /\b(done|fatto|completat|consegnat|pubblicat|chius|erledigt|termin|hecho|complet|ukończ|zrobion|заверш|сделан)/i;
const SEMANTIC_TITLES: [string, RegExp][] = [
  ["DONE", DONE_TITLE],
  ["BLOCKED", /\b(in attesa|attesa|waiting|on hold|bloccat|blocked)/i],
  ["ACTIVE", /\b(in corso|in progress|doing|in lavorazione|wip)\b/i],
  ["READY", /\b(da fare|to ?do|todo|pronto|ready)\b/i],
  ["INBOX", /\b(inbox|backlog|idee|ideas)\b/i],
];

export function isDoneColumn(column: { title: string; semanticKey?: string | null }, _index = 0, _total = 0) {
  if (column.semanticKey) return column.semanticKey === "DONE";
  return DONE_TITLE.test(column.title);
}

export function reopenColumn<T extends { id: string; title: string; semanticKey?: string | null }>(
  columns: T[],
  previousColumnId?: string | null,
) {
  const open = columns.filter(column => !isDoneColumn(column));
  return open.find(column => column.id === previousColumnId) ?? open.find(column => column.semanticKey === "READY") ?? open[0];
}

export function rememberedColumn(
  columns: Array<{ id: string; title: string; semanticKey?: string | null }>,
  from: string,
  to: string,
  previous?: string | null,
) {
  const source = columns.find(column => column.id === from);
  const target = columns.find(column => column.id === to);
  if (!source || !target || from === to) return previous ?? null;
  return !isDoneColumn(source) && isDoneColumn(target) ? from : isDoneColumn(target) ? (previous ?? null) : null;
}

/** Best-effort state for columns created by hand or imported, so cross-board views know what is finished or waiting. */
export function inferSemanticKey(title: string) {
  return SEMANTIC_TITLES.find(([, pattern]) => pattern.test(title))?.[0] || "CUSTOM";
}

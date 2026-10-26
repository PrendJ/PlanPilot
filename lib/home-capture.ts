/** Limits and pure helpers of the home capture (text, dictation, imports, task review). Safe on client and server. */

/** Characters per AI request (the ingest and routing APIs accept up to this). */
export const MAX_INPUT = 12_000;
/** Characters a document import or a Telegram transcript may bring in; longer text is worked through in parts. */
export const MAX_TRANSCRIPT = 60_000;
/** Transcribed speech runs at about 15 characters per second (~900 a minute): used to translate limits into time. */
export const CHARS_PER_SECOND = 15;
export const MAX_RECORDING_SECONDS = 120;

/** Minutes of speech that fill this many characters (rounded). */
export function speechMinutes(characters: number) {
  return Math.round(characters / CHARS_PER_SECOND / 60);
}

/** Seconds of dictation left before the transcript would push the draft past one request (at most 2 minutes). */
export function recordingSeconds(draftLength: number) {
  return Math.max(0, Math.min(MAX_RECORDING_SECONDS, Math.floor((MAX_INPUT - draftLength) / CHARS_PER_SECOND)));
}

/** Splits a long text on paragraph, then sentence, boundaries so each part fits one AI request. Nothing is dropped. */
export function splitTranscript(content: string, size = MAX_INPUT) {
  const parts: string[] = [];
  let rest = content.trim();
  while (rest.length > size) {
    const window = rest.slice(0, size);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". ") + 1);
    const at = cut > size * 0.5 ? cut : size;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Above the import ceiling the start is kept (at a line break when possible) and the cut is reported, never silent. */
export function cutImport(content: string): { content: string; cut: { total: number; kept: number } | null } {
  if (content.length <= MAX_TRANSCRIPT) return { content, cut: null };
  const lineBreak = content.slice(0, MAX_TRANSCRIPT).lastIndexOf("\n");
  const kept = lineBreak > MAX_TRANSCRIPT * 0.9 ? lineBreak : MAX_TRANSCRIPT;
  return { content: content.slice(0, kept).trim(), cut: { total: content.length, kept } };
}

/** Tasks of one board as "- task" lines, in as few requests as fit the per-request limit. */
export function taskRequests(tasks: string[], max = MAX_INPUT) {
  if (tasks.length === 1) return tasks;
  const requests: string[] = [];
  let current = "";
  for (const task of tasks) {
    const line = `- ${task}`;
    if (current && current.length + 1 + line.length > max) {
      requests.push(current);
      current = line;
    } else current = current ? `${current}\n${line}` : line;
  }
  if (current) requests.push(current);
  return requests;
}

export type ReviewTask = { key: string; text: string; workspaceId: string | null; newBoardName?: string | null };
export type TaskGroup<T extends ReviewTask> =
  | { kind: "board"; id: string; name: string; tasks: T[] }
  | { kind: "proposed"; name: string; tasks: T[] }
  | { kind: "unassigned"; tasks: T[] };

/** Tasks grouped by destination, in order: existing boards, proposed new boards (same name = same board), then the rest. */
export function groupTasks<T extends ReviewTask>(tasks: T[], boards: Array<{ id: string; name: string }>): TaskGroup<T>[] {
  const existing = new Map<string, TaskGroup<T> & { kind: "board" }>();
  const proposed = new Map<string, TaskGroup<T> & { kind: "proposed" }>();
  const unassigned: T[] = [];
  for (const task of tasks) {
    const board = task.workspaceId ? boards.find(item => item.id === task.workspaceId) : undefined;
    if (board) {
      if (!existing.has(board.id)) existing.set(board.id, { kind: "board", id: board.id, name: board.name, tasks: [] });
      existing.get(board.id)!.tasks.push(task);
    } else if (task.newBoardName?.trim()) {
      const name = task.newBoardName.trim();
      const key = name.toLocaleLowerCase();
      if (!proposed.has(key)) proposed.set(key, { kind: "proposed", name, tasks: [] });
      proposed.get(key)!.tasks.push(task);
    } else unassigned.push(task);
  }
  return [...existing.values(), ...proposed.values(), ...(unassigned.length ? [{ kind: "unassigned" as const, tasks: unassigned }] : [])];
}

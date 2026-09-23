import { keywords, normalizeText, relevance } from "@/lib/ai-context";

/**
 * Deterministic, local planner for the public demo (no AI call, no network). It imitates the real
 * behaviour on the demo board: recognises the card being talked about, moves or updates it, creates a
 * card only when nothing matches, and does nothing for negations and questions.
 */
export type DemoCard = {
  id: string;
  title: string;
  description: string;
  columnId: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dueDate: string | null;
  tags: string[];
};
export type DemoColumn = { id: string; title: string; intent: "inbox" | "todo" | "doing" | "waiting" | "done" };
export type DemoAction = {
  action: "create" | "update" | "move";
  cardId: string | null;
  title: string | null;
  targetColumnId: string | null;
  priority: DemoCard["priority"] | null;
  dueDate: string | null;
  reason: string;
};
export type DemoPlan = { summary: string; actions: DemoAction[]; noop?: "negation" | "question" | "empty" };

const INTENTS: Array<[DemoColumn["intent"], RegExp]> = [
  ["done", /\b(finit|complet|fatt[oa]|chius|consegnat|terminat|pubblicat|done|finished|completed|shipped)/],
  ["waiting", /\b(blocc|in attesa|aspett|serve (l|il|la|un)|waiting|blocked|stuck)/],
  ["doing", /\b(sto lavorando|lavorando|iniziat|comincia|in corso|sto facendo|started|working on|in progress)/],
  ["todo", /\b(da fare|prossim|next|to do|pianific)/],
];

function nextWeekday(from: Date, weekday: number) {
  const date = new Date(from);
  const delta = (weekday - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  date.setHours(18, 0, 0, 0);
  return date;
}

export function demoDueDate(text: string, now = new Date()) {
  const value = normalizeText(text);
  if (/\bdomani\b|\btomorrow\b/.test(value)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    date.setHours(18, 0, 0, 0);
    return date.toISOString();
  }
  const days = [
    /\bdomenica|sunday/,
    /\blunedi|monday/,
    /\bmartedi|tuesday/,
    /\bmercoledi|wednesday/,
    /\bgiovedi|thursday/,
    /\bvenerdi|friday/,
    /\bsabato|saturday/,
  ];
  const found = days.findIndex(pattern => pattern.test(value));
  if (found >= 0) return nextWeekday(now, found).toISOString();
  if (/fine mese|end of (the )?month/.test(value)) {
    const date = new Date(now.getFullYear(), now.getMonth() + 1, 0, 18);
    return date.toISOString();
  }
  return null;
}

export function planDemoUpdate(
  text: string,
  cards: DemoCard[],
  columns: DemoColumn[],
  locale: "it" | "en" = "it",
  now = new Date(),
): DemoPlan {
  const value = ` ${normalizeText(text)} `;
  const it = locale === "it";
  if (!value.trim()) return { summary: "", actions: [], noop: "empty" };
  if (/\?\s*$/.test(text.trim()) || /^\s*(come|quando|perche|chi|what|when|why|how)\b/.test(value.trim()))
    return {
      summary: it ? "È una domanda: la board resta com’è." : "That's a question: the board stays as it is.",
      actions: [],
      noop: "question",
    };
  if (/\b(non|not|don t|haven t|ancora no)\b/.test(value))
    return {
      summary: it ? "Hai detto che non è ancora successo: nessuna modifica." : "You said it hasn't happened yet: no changes.",
      actions: [],
      noop: "negation",
    };
  const words = keywords(text);
  const scored = cards
    .map(card => ({ card, score: relevance(card, words) }))
    .filter(entry => entry.score >= 3)
    .sort((a, b) => b.score - a.score);
  const intent = INTENTS.find(([, pattern]) => pattern.test(value))?.[0];
  const target = intent ? columns.find(column => column.intent === intent) : undefined;
  const dueDate = demoDueDate(text, now);
  const priority = /\burgent|subito|asap|priorit/.test(value) ? ("URGENT" as const) : null;
  const match = scored[0]?.card;
  if (match) {
    const moves = target && target.id !== match.columnId;
    if (!moves && !dueDate && !priority)
      return { summary: it ? `“${match.title}” è già nello stato giusto.` : `“${match.title}” is already up to date.`, actions: [] };
    const action: DemoAction = {
      action: moves && !dueDate && !priority ? "move" : "update",
      cardId: match.id,
      title: null,
      targetColumnId: moves ? target!.id : null,
      priority,
      dueDate,
      reason: it ? `Hai parlato di “${match.title}”.` : `You mentioned “${match.title}”.`,
    };
    const parts = [
      moves ? (it ? `sposto “${match.title}” in ${target!.title}` : `move “${match.title}” to ${target!.title}`) : null,
      dueDate ? (it ? "aggiorno la scadenza" : "update the due date") : null,
      priority ? (it ? "la segno come urgente" : "mark it urgent") : null,
    ].filter(Boolean);
    return { summary: (it ? "Ho capito: " : "Got it: ") + parts.join(", ") + ".", actions: [action] };
  }
  const title = text
    .trim()
    .replace(/^(ho|sto|devo|dobbiamo|bisogna|i|we|need to)\s+/i, "")
    .replace(/[.!?]+$/, "")
    .slice(0, 90);
  const column = target || columns.find(entry => entry.intent === "todo") || columns[0];
  const clean = title.charAt(0).toUpperCase() + title.slice(1);
  return {
    summary: it
      ? `Non trovo una card esistente: ne creo una nuova in ${column.title}.`
      : `No matching card: I'll create one in ${column.title}.`,
    actions: [
      {
        action: "create",
        cardId: null,
        title: clean,
        targetColumnId: column.id,
        priority,
        dueDate,
        reason: it ? "Nessuna card esistente corrisponde." : "No existing card matches.",
      },
    ],
  };
}

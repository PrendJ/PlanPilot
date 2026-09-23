export type Person = { id: string; name: string; email: string; role?: string };
export type ChecklistItem = { id: string; text: string; done: boolean };
export type Card = {
  id: string;
  title: string;
  description: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  tags: unknown;
  dueDate: string | null;
  archived: boolean;
  position: number;
  version: number;
  checklist: unknown;
  columnId: string;
  updatedAt: string;
  createdAt: string;
  assignees: { user: Person }[];
  commentCount: number;
};
export type Column = { id: string; title: string; description: string; position: number; cards: Card[] };
export type Quota = {
  used: number;
  included: number;
  credits: number;
  remaining: number | null;
  percent: number;
  status: "ACTIVE" | "WARNING" | "CRITICAL" | "PAUSED";
  resetsAt: string | null;
};
export type BoardData = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    locale: string;
    dictationEnabled: boolean;
    planModel: string;
    revision: number;
    role: string;
    canManage: boolean;
    canWrite: boolean;
    readOnly: boolean;
    organizationId: string;
    organizationName: string;
    plan: string;
  };
  columns: Column[];
  members: Person[];
  quota: Quota | null;
  me: { id: string; name: string; autoApplyAi: boolean; autoSendDictation: boolean; verified: boolean };
  pendingProposalId: string | null;
};
export type PreviewAction = {
  index: number;
  action: "create" | "update" | "move" | "archive";
  cardId: string | null;
  cardTitle: string | null;
  newTitle: string | null;
  fromColumn: string | null;
  toColumn: string | null;
  changes: Array<{ field: "priority" | "dueDate" | "tags" | "description" | "title"; from: string | null; to: string | null }>;
  reason: string;
};
export type Proposal = {
  id: string;
  summary: string;
  clarification: { question: string; options: string[] } | null;
  status: string;
  expiresAt: string;
  inputText: string;
  source: string;
  actions: PreviewAction[];
};

export function tagsOf(card: Pick<Card, "tags">) {
  return Array.isArray(card.tags) ? card.tags.map(String) : [];
}

export function checklistOf(card: Pick<Card, "checklist">): ChecklistItem[] {
  return Array.isArray(card.checklist) ? (card.checklist as ChecklistItem[]).filter(item => item && typeof item.text === "string") : [];
}

export type DueState = "overdue" | "soon" | "later" | "done";

/** Due-date status: overdue (past), soon (within 48h), later. Cards in a "done"-like last column show as done. */
export function dueState(dueDate: string | null, now = new Date(), done = false): DueState | null {
  if (!dueDate) return null;
  if (done) return "done";
  const due = new Date(dueDate).getTime();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (due < startOfToday.getTime()) return "overdue";
  if (due - now.getTime() < 48 * 3600_000) return "soon";
  return "later";
}

export function formatDue(dueDate: string, tag: string, now = new Date()) {
  const date = new Date(dueDate);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(tag, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** yyyy-mm-dd for <input type="date"> in local time. */
export function toDateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Due dates chosen in the UI are stored at 18:00 local time, like the AI does. */
export function fromDateInput(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 18, 0, 0).toISOString();
}

export function isDoneColumn(column: Pick<Column, "title">, index: number, total: number) {
  return index === total - 1 || /\b(done|fatto|completat|consegnat|pubblicat|chius)/i.test(column.title);
}

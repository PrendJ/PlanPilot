import { z } from "zod";
import { PRIORITIES, type ChecklistItem } from "@/lib/card-schema";

export type ImportedCard = {
  title: string;
  description: string;
  priority: (typeof PRIORITIES)[number];
  dueDate: Date | null;
  tags: string[];
  checklist: ChecklistItem[];
  archived: boolean;
};
export type ImportedBoard = { columns: Array<{ title: string; cards: ImportedCard[] }> };

export const MAX_IMPORT_CARDS = 2000;

const trelloSchema = z.object({
  lists: z.array(z.object({ id: z.string(), name: z.string(), closed: z.boolean().optional(), pos: z.number().optional() })),
  cards: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      desc: z.string().optional(),
      idList: z.string(),
      closed: z.boolean().optional(),
      due: z.string().nullable().optional(),
      pos: z.number().optional(),
      labels: z.array(z.object({ name: z.string().optional(), color: z.string().nullable().optional() })).optional(),
      idChecklists: z.array(z.string()).optional(),
    }),
  ),
  checklists: z
    .array(
      z.object({
        id: z.string(),
        idCard: z.string(),
        checkItems: z.array(z.object({ id: z.string(), name: z.string(), state: z.string() })),
      }),
    )
    .optional(),
});

const clip = (value: string, max: number) => value.trim().slice(0, max);

function priorityFrom(value: string | undefined) {
  const text = (value || "").toLowerCase();
  if (/urgent|urgente|critic/.test(text)) return "URGENT" as const;
  if (/high|alta|important/.test(text)) return "HIGH" as const;
  if (/low|bassa/.test(text)) return "LOW" as const;
  return "NORMAL" as const;
}

function dateFrom(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const italian = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const date = italian ? new Date(Date.UTC(Number(italian[3]), Number(italian[2]) - 1, Number(italian[1]), 16)) : new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Trello board export (Menu → Print, export and share → Export as JSON). */
export function parseTrello(input: unknown): ImportedBoard {
  const data = trelloSchema.parse(input);
  const checklists = new Map((data.checklists || []).map(list => [list.id, list]));
  const lists = data.lists.filter(list => !list.closed).sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
  return {
    columns: lists.map(list => ({
      title: clip(list.name, 80) || "Lista",
      cards: data.cards
        .filter(card => card.idList === list.id)
        .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
        .map(card => {
          const labels = (card.labels || []).map(label => label.name || "").filter(Boolean);
          const items = (card.idChecklists || []).flatMap(id => checklists.get(id)?.checkItems || []);
          return {
            title: clip(card.name, 180) || "Card",
            description: (card.desc || "").slice(0, 10000),
            priority: priorityFrom(labels.join(" ")),
            dueDate: dateFrom(card.due),
            tags: labels.map(label => clip(label, 40)).slice(0, 20),
            checklist: items
              .slice(0, 50)
              .map((item, index) => ({ id: `t${index}`, text: clip(item.name, 300) || "—", done: item.state === "complete" })),
            archived: Boolean(card.closed),
          };
        }),
    })),
  };
}

/** Minimal RFC 4180 parser (quotes, escaped quotes, commas/semicolons, CRLF). */
export function parseCsvRows(text: string) {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

const HEADERS: Record<string, keyof ImportedCard | "column"> = {
  title: "title",
  titolo: "title",
  name: "title",
  nome: "title",
  card: "title",
  description: "description",
  descrizione: "description",
  desc: "description",
  note: "description",
  column: "column",
  colonna: "column",
  list: "column",
  lista: "column",
  stato: "column",
  status: "column",
  priority: "priority",
  priorita: "priority",
  priorità: "priority",
  due: "dueDate",
  duedate: "dueDate",
  scadenza: "dueDate",
  "due date": "dueDate",
  tags: "tags",
  tag: "tags",
  etichette: "tags",
  labels: "tags",
};

/** CSV with a header row: title (required), description, column, priority, due date, tags. */
export function parseCsv(text: string): ImportedBoard {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error("EMPTY");
  const header = rows[0].map(cell => HEADERS[cell.trim().toLowerCase()]);
  if (!header.includes("title")) throw new Error("NO_TITLE");
  const columns = new Map<string, ImportedCard[]>();
  for (const cells of rows.slice(1)) {
    const value = (key: string) => {
      const index = header.indexOf(key as never);
      return index >= 0 ? (cells[index] || "").trim() : "";
    };
    const title = clip(value("title"), 180);
    if (!title) continue;
    const column = clip(value("column"), 80) || "Inbox";
    const list = columns.get(column) || [];
    list.push({
      title,
      description: value("description").slice(0, 10000),
      priority: priorityFrom(value("priority")),
      dueDate: dateFrom(value("dueDate")),
      tags: value("tags")
        .split(/[,|]/)
        .map(tag => clip(tag, 40))
        .filter(Boolean)
        .slice(0, 20),
      checklist: [],
      archived: false,
    });
    columns.set(column, list);
  }
  return { columns: [...columns.entries()].map(([title, cards]) => ({ title, cards })) };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]) {
  // BOM so Excel opens UTF-8 correctly.
  return `﻿${[columns.join(","), ...rows.map(row => columns.map(column => csvCell(row[column])).join(","))].join("\r\n")}\r\n`;
}

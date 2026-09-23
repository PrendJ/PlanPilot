"use client";

import { useMemo, useState } from "react";
import { useI18n } from "../I18nProvider";
import { Avatar } from "../ui";
import { dueState, formatDue, isDoneColumn, type Card, type Column } from "./types";

type SortKey = "title" | "column" | "priority" | "dueDate" | "updatedAt";
const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;

/** Sortable table of every visible card: useful to scan deadlines and priorities across columns. */
export function ListView({ columns, onOpen }: { columns: Column[]; onOpen: (card: Card) => void }) {
  const { t, tag } = useI18n();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "dueDate", dir: 1 });
  const rows = useMemo(() => {
    const all = columns.flatMap((column, index) =>
      column.cards.map(card => ({ card, column, done: isDoneColumn(column, index, columns.length), columnIndex: index })),
    );
    const value = (row: (typeof all)[number]): string | number => {
      switch (sort.key) {
        case "title":
          return row.card.title.toLowerCase();
        case "column":
          return row.columnIndex;
        case "priority":
          return PRIORITY_ORDER[row.card.priority];
        case "dueDate":
          return row.card.dueDate ? new Date(row.card.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        default:
          return -new Date(row.card.updatedAt).getTime();
      }
    };
    return [...all].sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * sort.dir);
  }, [columns, sort]);
  const header = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="sort"
        onClick={() => setSort(current => ({ key, dir: current.key === key ? (current.dir === 1 ? -1 : 1) : 1 }))}
      >
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  if (!rows.length)
    return (
      <div className="empty-state">
        <h3>{t("board.list.empty")}</h3>
      </div>
    );
  return (
    <div className="table-wrap list-view">
      <table className="table">
        <thead>
          <tr>
            {header("title", t("board.card.title"))}
            {header("column", t("board.card.column"))}
            {header("priority", t("board.card.priority"))}
            {header("dueDate", t("board.card.dueDate"))}
            <th>{t("board.card.assignees")}</th>
            {header("updatedAt", t("board.list.updated"))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ card, column, done }) => {
            const due = dueState(card.dueDate, new Date(), done);
            return (
              <tr
                key={card.id}
                onClick={() => onOpen(card)}
                tabIndex={0}
                onKeyDown={event => {
                  if (event.key === "Enter") onOpen(card);
                }}
              >
                <td className="title">{card.title}</td>
                <td>{column.title}</td>
                <td>
                  {card.priority !== "NORMAL" ? (
                    <span className={`prio prio-${card.priority}`}>{t(`priority.${card.priority}`)}</span>
                  ) : (
                    <span className="subtle">{t("priority.NORMAL")}</span>
                  )}
                </td>
                <td>
                  {card.dueDate ? <span className={`due ${due}`}>{formatDue(card.dueDate, tag)}</span> : <span className="subtle">—</span>}
                </td>
                <td>
                  <span className="avatar-stack">
                    {card.assignees.map(item => (
                      <Avatar key={item.user.id} name={item.user.name} size="sm" />
                    ))}
                  </span>
                </td>
                <td className="subtle">{new Date(card.updatedAt).toLocaleDateString(tag, { day: "numeric", month: "short" })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

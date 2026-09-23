"use client";

import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { useI18n } from "../I18nProvider";
import { dueState, isDoneColumn, type Card, type Column } from "./types";

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Month grid of cards with a due date (Monday first). Cards without a date are listed below. */
export function CalendarView({ columns, onOpen }: { columns: Column[]; onOpen: (card: Card) => void }) {
  const { t, tag } = useI18n();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const { byDay, undated } = useMemo(() => {
    const map = new Map<string, Array<{ card: Card; done: boolean }>>();
    const none: Card[] = [];
    columns.forEach((column, index) =>
      column.cards.forEach(card => {
        if (!card.dueDate) {
          none.push(card);
          return;
        }
        const key = dayKey(new Date(card.dueDate));
        map.set(key, [...(map.get(key) || []), { card, done: isDoneColumn(column, index, columns.length) }]);
      }),
    );
    return { byDay: map, undated: none };
  }, [columns]);
  const start = new Date(month);
  start.setDate(1 - ((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const weekdays = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 1 + index).toLocaleDateString(tag, { weekday: "short" }));
  const today = dayKey(new Date());
  return (
    <div className="stack">
      <div className="calendar">
        <div className="calendar-head">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            aria-label={t("board.calendar.previous")}
          >
            <Icon name="chevronLeft" />
          </button>
          <h2>{month.toLocaleDateString(tag, { month: "long", year: "numeric" })}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            aria-label={t("board.calendar.next")}
          >
            <Icon name="chevronRight" />
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              const now = new Date();
              setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            {t("board.calendar.today")}
          </button>
        </div>
        <div className="calendar-grid">
          {weekdays.map(day => (
            <div key={day} className="dow">
              {day}
            </div>
          ))}
          {days.map(date => {
            const items = byDay.get(dayKey(date)) || [];
            return (
              <div
                key={date.toISOString()}
                className={`calendar-day ${date.getMonth() !== month.getMonth() ? "muted" : ""} ${dayKey(date) === today ? "today" : ""}`}
              >
                <span className="num">{date.getDate()}</span>
                {items.slice(0, 3).map(({ card, done }) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`calendar-card ${dueState(card.dueDate, new Date(), done) === "overdue" ? "overdue" : ""}`}
                    onClick={() => onOpen(card)}
                    title={card.title}
                  >
                    {card.title}
                  </button>
                ))}
                {items.length > 3 && <span className="subtle">+{items.length - 3}</span>}
              </div>
            );
          })}
        </div>
      </div>
      {undated.length > 0 && <p className="subtle">{t("board.calendar.undated", { count: undated.length })}</p>}
    </div>
  );
}

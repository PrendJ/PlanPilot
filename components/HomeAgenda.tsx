"use client";

import Link from "next/link";
import { useState } from "react";
import type { HomeTask, HomeTaskGroups } from "@/lib/home-agenda";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";

type AgendaProps = { groups: HomeTaskGroups; loading: boolean; error: boolean };

export function HomeTaskSummary({ groups, loading, error }: AgendaProps) {
  const { t, tag } = useI18n();
  return (
    <section className="panel home-task-summary" aria-labelledby="home-summary-title" aria-busy={loading}>
      <span className="eyebrow">{t("home.today.eyebrow")}</span>
      <h2 id="home-summary-title">{t("home.agenda.summary")}</h2>
      <p className="subtle">{new Date().toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" })}</p>
      <dl className="home-task-stats">
        {(["today", "overdue", "upcoming"] as const).map(key => (
          <div key={key} className={`home-task-stat ${key}`}>
            <dt>
              <Icon name={key === "overdue" ? "clock" : "calendar"} size={16} />
              {t(`home.agenda.${key}`)}
            </dt>
            <dd>{loading || error ? "—" : groups[key].length.toLocaleString(tag)}</dd>
          </div>
        ))}
      </dl>
      <p className="subtle home-summary-note">{t(error ? "home.today.error" : "home.agenda.weekHint")}</p>
    </section>
  );
}

function TaskRow({ card, overdue, onDone }: { card: HomeTask; overdue: boolean; onDone: (card: HomeTask) => void }) {
  const { t, tag } = useI18n();
  return (
    <li className={`home-agenda-task${overdue ? " overdue" : ""}`}>
      {card.doneColumnId && (
        <button
          type="button"
          className="home-agenda-done"
          onClick={() => onDone(card)}
          aria-label={t("home.today.markDone", { title: card.title })}
        >
          <Icon name="check" size={16} />
        </button>
      )}
      <Link className="home-agenda-task-link" href={`/app/${card.slug}?card=${card.id}`}>
        <div className="home-agenda-task-copy">
          <strong>{card.title}</strong>
          <span>
            {card.board} · {card.column}
          </span>
        </div>
        <div className="home-agenda-task-meta">
          {(card.priority === "URGENT" || card.priority === "HIGH") && (
            <span className={`today-priority ${card.priority.toLowerCase()}`}>{t(`priority.${card.priority}`)}</span>
          )}
          {card.dueDate && (
            <time dateTime={card.dueDate}>{new Date(card.dueDate).toLocaleDateString(tag, { day: "numeric", month: "short" })}</time>
          )}
          <Icon name="chevronRight" size={16} />
        </div>
      </Link>
    </li>
  );
}

export function HomeAgenda({
  groups,
  active,
  loading,
  error,
  onDone,
  onRetry,
}: AgendaProps & {
  active: HomeTask[];
  onDone: (card: HomeTask) => void;
  onRetry: () => void;
}) {
  const { t, tag } = useI18n();
  const [view, setView] = useState<"focus" | "upcoming">("focus");
  const sections = view === "focus" ? (["overdue", "today"] as const) : (["upcoming"] as const);
  const count = view === "focus" ? groups.today.length + groups.overdue.length : groups.upcoming.length;
  return (
    <section className="panel home-agenda" aria-labelledby="home-agenda-title" aria-busy={loading}>
      <div className="home-agenda-heading">
        <div>
          <span className="eyebrow">{t("home.agenda.eyebrow")}</span>
          <h2 id="home-agenda-title">{t("home.agenda.title")}</h2>
          <p className="subtle">{t("home.agenda.description")}</p>
        </div>
        <span className="home-agenda-icon" aria-hidden="true">
          <Icon name="list" size={24} />
        </span>
      </div>
      <div className="home-agenda-tabs" role="group" aria-label={t("home.agenda.period")}>
        {(["focus", "upcoming"] as const).map(key => (
          <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>
            {t(`home.agenda.${key}`)}
            {!loading && !error && (
              <span>{(key === "focus" ? groups.today.length + groups.overdue.length : groups.upcoming.length).toLocaleString(tag)}</span>
            )}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="home-agenda-status" role="status">
          <span className="spinner" />
          {t("home.agenda.loading")}
        </p>
      ) : error ? (
        <div className="home-agenda-status" role="alert">
          <p>{t("home.today.error")}</p>
          <button type="button" className="btn sm" onClick={onRetry}>
            {t("home.assistant.refresh")}
          </button>
        </div>
      ) : (
        <>
          {!count && (
            <div className="home-agenda-empty">
              <Icon name="checkCircle" size={28} />
              <div>
                <strong>{t("home.agenda.emptyTitle")}</strong>
                <p className="subtle">{t(view === "focus" ? "home.today.empty" : "home.agenda.emptyUpcoming")}</p>
              </div>
            </div>
          )}
          {sections.map(
            key =>
              groups[key].length > 0 && (
                <section key={key} className={`home-agenda-group ${key}`} aria-labelledby={`home-agenda-${key}`}>
                  <h3 id={`home-agenda-${key}`}>
                    <span>{t(`home.agenda.${key}`)}</span>
                    <span className="home-agenda-count">{groups[key].length.toLocaleString(tag)}</span>
                  </h3>
                  <ul>
                    {groups[key].map(card => (
                      <TaskRow key={card.id} card={card} overdue={key === "overdue"} onDone={onDone} />
                    ))}
                  </ul>
                </section>
              ),
          )}
          {view === "focus" && active.length > 0 && (
            <details className="home-agenda-active">
              <summary>
                {t("home.today.activeTitle")} <span>{active.length.toLocaleString(tag)}</span>
              </summary>
              <ul>
                {active.map(card => (
                  <TaskRow key={card.id} card={card} overdue={false} onDone={onDone} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

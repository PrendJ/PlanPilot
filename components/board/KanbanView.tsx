"use client";

import { useRef, useState } from "react";
import { Icon } from "../Icon";
import { useT } from "../I18nProvider";
import { CardTile } from "./CardTile";
import { isDoneColumn, type Card, type Column } from "./types";

type Props = {
  columns: Column[];
  highlighted: Set<string>;
  canWrite: boolean;
  archivedView: boolean;
  onOpen: (card: Card) => void;
  onMove: (card: Card, columnId: string, index?: number) => void;
  onArchive: (card: Card, archived: boolean) => void;
  onAdd: (columnId: string) => void;
};

/** Drop position = number of cards whose vertical midpoint is above the pointer. */
function dropIndex(container: HTMLElement, clientY: number, draggedId: string | null) {
  const cards = [...container.querySelectorAll<HTMLElement>("[data-card-id]")].filter(node => node.dataset.cardId !== draggedId);
  return cards.filter(node => {
    const box = node.getBoundingClientRect();
    return box.top + box.height / 2 < clientY;
  }).length;
}

export function KanbanView({ columns, highlighted, canWrite, archivedView, onOpen, onMove, onArchive, onAdd }: Props) {
  const t = useT();
  const [dragged, setDragged] = useState<Card | null>(null);
  const [target, setTarget] = useState<{ columnId: string; index: number } | null>(null);
  const [active, setActive] = useState(0);
  const board = useRef<HTMLDivElement>(null);
  const scrollTo = (index: number) => {
    setActive(index);
    (board.current?.children[index] as HTMLElement | undefined)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };
  return (
    <>
      <nav className="column-pager" aria-label={t("board.columns")}>
        <button
          type="button"
          className="icon-btn bordered"
          onClick={() => scrollTo(Math.max(0, active - 1))}
          disabled={active === 0}
          aria-label={t("board.previousColumn")}
        >
          <Icon name="chevronLeft" />
        </button>
        <select value={active} onChange={event => scrollTo(Number(event.target.value))} aria-label={t("board.columns")}>
          {columns.map((column, index) => (
            <option key={column.id} value={index}>
              {column.title} ({column.cards.length})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-btn bordered"
          onClick={() => scrollTo(Math.min(columns.length - 1, active + 1))}
          disabled={active === columns.length - 1}
          aria-label={t("board.nextColumn")}
        >
          <Icon name="chevronRight" />
        </button>
      </nav>
      <div
        className="kanban"
        ref={board}
        onScroll={event => {
          const node = event.currentTarget;
          const width = (node.firstElementChild as HTMLElement | null)?.offsetWidth || 1;
          setActive(Math.round(node.scrollLeft / (width + 10)));
        }}
      >
        {columns.map((column, columnIndex) => {
          const done = isDoneColumn(column, columnIndex, columns.length);
          const isTarget = target?.columnId === column.id;
          return (
            <section
              key={column.id}
              className={`column ${isTarget ? "drop-target" : ""}`}
              aria-labelledby={`col-${column.id}`}
              onDragOver={event => {
                if (!dragged) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const body = event.currentTarget.querySelector<HTMLElement>(".column-body");
                if (body) setTarget({ columnId: column.id, index: dropIndex(body, event.clientY, dragged.id) });
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setTarget(current => (current?.columnId === column.id ? null : current));
              }}
              onDrop={event => {
                event.preventDefault();
                if (dragged && target) onMove(dragged, column.id, target.index);
                setDragged(null);
                setTarget(null);
              }}
            >
              <header className="column-head">
                <h2 id={`col-${column.id}`}>{column.title}</h2>
                <span className="count">{column.cards.length}</span>
                <span className="spacer" />
                {canWrite && !archivedView && (
                  <button
                    type="button"
                    className="icon-btn add"
                    onClick={() => onAdd(column.id)}
                    aria-label={t("board.addCardTo", { column: column.title })}
                  >
                    <Icon name="plus" size={16} />
                  </button>
                )}
              </header>
              {column.description && <p className="column-desc">{column.description}</p>}
              <div className="column-body">
                {column.cards.map((card, index) => (
                  <div key={card.id} style={{ display: "contents" }}>
                    {isTarget && target.index === index && dragged?.id !== card.id && <div className="drop-indicator" aria-hidden="true" />}
                    <CardTile
                      card={card}
                      columns={columns}
                      done={done}
                      highlighted={highlighted.has(card.id)}
                      canWrite={canWrite}
                      archivedView={archivedView}
                      onOpen={onOpen}
                      onMove={onMove}
                      onArchive={onArchive}
                      onDragStart={setDragged}
                      onDragEnd={() => {
                        setDragged(null);
                        setTarget(null);
                      }}
                      dragging={dragged?.id === card.id}
                    />
                  </div>
                ))}
                {isTarget && target.index >= column.cards.filter(card => card.id !== dragged?.id).length && (
                  <div className="drop-indicator" aria-hidden="true" />
                )}
                {!column.cards.length && (
                  <div className="column-empty">
                    {archivedView ? t("board.emptyArchived") : canWrite ? t("board.emptyColumn") : t("board.emptyColumnReadOnly")}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

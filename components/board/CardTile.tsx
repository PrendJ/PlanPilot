"use client";

import { memo } from "react";
import { Icon } from "../Icon";
import { useI18n } from "../I18nProvider";
import { Avatar, MenuButton } from "../ui";
import { checklistOf, dueState, formatDue, tagsOf, type Card, type Column } from "./types";

type Props = {
  card: Card;
  columns: Column[];
  done: boolean;
  highlighted: boolean;
  canWrite: boolean;
  archivedView: boolean;
  onOpen: (card: Card) => void;
  onMove: (card: Card, columnId: string) => void;
  onArchive: (card: Card, archived: boolean) => void;
  onDragStart: (card: Card) => void;
  onDragEnd: () => void;
  dragging: boolean;
};

export const CardTile = memo(function CardTile({
  card,
  columns,
  done,
  highlighted,
  canWrite,
  archivedView,
  onOpen,
  onMove,
  onArchive,
  onDragStart,
  onDragEnd,
  dragging,
}: Props) {
  const { t, tag } = useI18n();
  const due = dueState(card.dueDate, new Date(), done);
  const checklist = checklistOf(card);
  const completed = checklist.filter(item => item.done).length;
  const tags = tagsOf(card);
  return (
    <div
      className={`card ${highlighted ? "ai-changed" : ""} ${dragging ? "dragging" : ""}`}
      data-card-id={card.id}
      role="button"
      tabIndex={0}
      aria-label={card.title}
      draggable={canWrite && !archivedView}
      onDragStart={event => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/card-id", card.id);
        onDragStart(card);
      }}
      onDragEnd={onDragEnd}
      onClick={event => {
        if (!(event.target as HTMLElement).closest(".card-menu")) onOpen(card);
      }}
      onKeyDown={event => {
        if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
          event.preventDefault();
          onOpen(card);
        }
      }}
    >
      <div className="card-title">{card.title}</div>
      {card.description && <div className="card-desc">{card.description}</div>}
      {(card.priority !== "NORMAL" || due || tags.length > 0) && (
        <div className="card-meta">
          {card.priority !== "NORMAL" && (
            <span className={`prio prio-${card.priority}`}>
              {card.priority === "URGENT" ? (
                <Icon name="alertOctagon" size={12} />
              ) : card.priority === "HIGH" ? (
                <Icon name="chevronsUp" size={12} />
              ) : (
                <Icon name="chevronDown" size={12} />
              )}
              {t(`priority.${card.priority}`)}
            </span>
          )}
          {due && card.dueDate && (
            <span className={`due ${due}`} title={t(`board.due.${due}`)}>
              <Icon name="calendar" size={12} />
              {formatDue(card.dueDate, tag)}
            </span>
          )}
          {tags.slice(0, 4).map(item => (
            <span className="tag" key={item}>
              {item}
            </span>
          ))}
        </div>
      )}
      {(checklist.length > 0 || card.commentCount > 0 || card.assignees.length > 0) && (
        <div className="card-foot">
          {checklist.length > 0 && (
            <span className="stat" title={t("board.card.checklist")}>
              <Icon name="checklist" size={13} />
              {completed}/{checklist.length}
            </span>
          )}
          {card.commentCount > 0 && (
            <span className="stat" title={t("board.card.comments")}>
              <Icon name="message" size={13} />
              {card.commentCount}
            </span>
          )}
          <span className="spacer" />
          {card.assignees.length > 0 && (
            <span className="avatar-stack">
              {card.assignees.slice(0, 3).map(item => (
                <Avatar key={item.user.id} name={item.user.name} size="sm" />
              ))}
            </span>
          )}
        </div>
      )}
      {canWrite && (
        <div className="card-menu">
          <MenuButton label={t("board.card.actions", { title: card.title })} icon="more">
            {close => (
              <>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    close();
                    onOpen(card);
                  }}
                >
                  <Icon name="edit" />
                  {t("board.card.open")}
                </button>
                {!archivedView && (
                  <>
                    <div className="menu-label">{t("board.card.moveTo")}</div>
                    {columns
                      .filter(column => column.id !== card.columnId)
                      .map(column => (
                        <button
                          key={column.id}
                          type="button"
                          className="menu-item"
                          onClick={() => {
                            close();
                            onMove(card, column.id);
                          }}
                        >
                          <Icon name="arrowRight" />
                          {column.title}
                        </button>
                      ))}
                    <div className="menu-sep" />
                  </>
                )}
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    close();
                    onArchive(card, !archivedView);
                  }}
                >
                  <Icon name={archivedView ? "undo" : "archive"} />
                  {archivedView ? t("board.card.restore") : t("board.card.archive")}
                </button>
              </>
            )}
          </MenuButton>
        </div>
      )}
    </div>
  );
});

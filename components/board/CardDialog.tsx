"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { useI18n } from "../I18nProvider";
import { api, Avatar, Dialog, useFeedback } from "../ui";
import { checklistOf, fromDateInput, tagsOf, toDateInput, type Card, type ChecklistItem, type Column, type Person } from "./types";

type Comment = {
  id: string;
  body: string;
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
  user: { id: string; name: string };
};
type Draft = {
  title: string;
  description: string;
  columnId: string;
  priority: Card["priority"];
  dueDate: string;
  tags: string;
  assigneeIds: string[];
  checklist: ChecklistItem[];
};

type Props = {
  slug: string;
  card: Card | null;
  initialColumnId?: string;
  columns: Column[];
  members: Person[];
  meId: string;
  canWrite: boolean;
  canComment: boolean;
  canManage: boolean;
  onClose: () => void;
  onSaved: (card: Card) => void;
};

function draftFrom(card: Card | null, columnId: string): Draft {
  return {
    title: card?.title || "",
    description: card?.description || "",
    columnId: card?.columnId || columnId,
    priority: card?.priority || "NORMAL",
    dueDate: toDateInput(card?.dueDate || null),
    tags: card ? tagsOf(card).join(", ") : "",
    assigneeIds: card?.assignees.map(item => item.user.id) || [],
    checklist: card ? checklistOf(card) : [],
  };
}

function renderComment(body: string, members: Person[]) {
  const names = members
    .map(member => member.name)
    .sort((a, b) => b.length - a.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!names.length) return body;
  const parts = body.split(new RegExp(`(@(?:${names.join("|")}))`, "g"));
  return parts.map((part, index) =>
    part.startsWith("@") && names.some(name => new RegExp(`^@${name}$`).test(part)) ? (
      <span key={index} className="mention">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** Card detail: fields, checklist, assignees, comments with @mentions, and the card's own history. */
export function CardDialog({
  slug,
  card: initialCard,
  initialColumnId,
  columns,
  members,
  meId,
  canWrite,
  canComment,
  canManage,
  onClose,
  onSaved,
}: Props) {
  const { t, tag } = useI18n();
  const { toast, confirm } = useFeedback();
  const [card, setCard] = useState<Card | null>(initialCard);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initialCard, initialColumnId || columns[0]?.id || ""));
  const [saved, setSaved] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Card | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<Array<{ id: string; type: string; createdAt: string; user: { name: string } }>>([]);
  const [comment, setComment] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [askDiscard, setAskDiscard] = useState(false);
  const isNew = !card;
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const editable = canWrite;

  const loadDetails = useCallback(async () => {
    if (!initialCard) return;
    const [detail, list] = await Promise.all([
      api<{ card: Card; activity: typeof activity }>(`/api/workspaces/${slug}/cards/${initialCard.id}`),
      api<{ comments: Comment[] }>(`/api/workspaces/${slug}/cards/${initialCard.id}/comments`),
    ]);
    if (detail.ok) {
      setCard(detail.data.card);
      setActivity(detail.data.activity);
    }
    if (list.ok) setComments(list.data.comments);
  }, [initialCard, slug]);
  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));

  async function save(event?: React.FormEvent) {
    event?.preventDefault();
    if (!draft.title.trim()) return;
    setBusy(true);
    const payload = {
      title: draft.title.trim(),
      description: draft.description,
      columnId: draft.columnId,
      priority: draft.priority,
      dueDate: fromDateInput(draft.dueDate),
      tags: draft.tags
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 20),
      assigneeIds: draft.assigneeIds,
      checklist: draft.checklist.filter(item => item.text.trim()),
    };
    const response = isNew
      ? await api<{ card: Card }>(`/api/workspaces/${slug}/cards`, { method: "POST", json: payload })
      : await api<{ card: Card }>(`/api/workspaces/${slug}/cards/${card!.id}`, {
          method: "PATCH",
          json: { ...payload, version: card!.version },
        });
    setBusy(false);
    if (response.ok) {
      setCard(response.data.card);
      const next = draftFrom(response.data.card, draft.columnId);
      setDraft(next);
      setSaved(next);
      setConflict(null);
      onSaved(response.data.card);
      toast({ message: isNew ? t("board.card.created") : t("board.card.saved") });
      if (isNew) onClose();
      return;
    }
    if (response.data.code === "CARD_CONFLICT") {
      setConflict((response.data as unknown as { card: Card }).card);
      return;
    }
    toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
  }

  async function postComment(event: React.FormEvent) {
    event.preventDefault();
    if (!card || !comment.trim()) return;
    const response = await api<{ comment: Comment }>(`/api/workspaces/${slug}/cards/${card.id}/comments`, {
      method: "POST",
      json: {
        body: comment.trim(),
        mentions: mentions.filter(id => comment.includes(`@${members.find(member => member.id === id)?.name}`)),
      },
    });
    if (!response.ok) {
      toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
      return;
    }
    setComments(current => [...current, response.data.comment]);
    setComment("");
    setMentions([]);
  }

  async function removeComment(id: string) {
    if (!(await confirm({ title: t("board.comments.deleteTitle"), confirmLabel: t("common.delete"), danger: true }))) return;
    const response = await api(`/api/workspaces/${slug}/comments/${id}`, { method: "DELETE" });
    if (response.ok) setComments(current => current.filter(item => item.id !== id));
  }

  function mention(member: Person) {
    setComment(current => `${current}${current && !current.endsWith(" ") ? " " : ""}@${member.name} `);
    setMentions(current => [...new Set([...current, member.id])]);
  }

  const writers = members.filter(member => member.role !== "GUEST");
  return (
    <Dialog
      wide
      title={isNew ? t("board.card.newTitle") : t("board.card.editTitle")}
      onClose={onClose}
      confirmClose={() => {
        if (!dirty) return true;
        setAskDiscard(true);
        return false;
      }}
      footer={
        editable ? (
          <>
            {dirty && <span className="subtle">{t("board.card.unsaved")}</span>}
            <button type="button" className="btn" onClick={() => (dirty ? setAskDiscard(true) : onClose())}>
              {t("common.cancel")}
            </button>
            <button type="submit" form="card-form" className="btn primary" disabled={busy || !draft.title.trim() || (!dirty && !isNew)}>
              {busy ? <span className="spinner" /> : null}
              {isNew ? t("board.card.create") : t("common.save")}
            </button>
          </>
        ) : undefined
      }
    >
      {askDiscard && (
        <div className="notice warning" role="alert">
          <Icon name="alert" />
          <div className="notice-body">{t("board.card.discardChanges")}</div>
          <button type="button" className="btn sm" onClick={() => setAskDiscard(false)}>
            {t("board.card.keepEditing")}
          </button>
          <button type="button" className="btn sm danger" onClick={onClose}>
            {t("board.card.discard")}
          </button>
        </div>
      )}
      {conflict && (
        <div className="notice warning" role="alert">
          <Icon name="alert" />
          <div className="notice-body">{t("errors.CARD_CONFLICT")}</div>
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setCard(conflict);
              const next = draftFrom(conflict, draft.columnId);
              setDraft(next);
              setSaved(next);
              setConflict(null);
            }}
          >
            {t("board.card.loadLatest")}
          </button>
        </div>
      )}
      <form id="card-form" className="card-dialog" onSubmit={save}>
        <div>
          <label htmlFor="card-title" className="sr-only">
            {t("board.card.title")}
          </label>
          <input
            id="card-title"
            className="title-input"
            data-autofocus
            value={draft.title}
            onChange={event => set("title", event.target.value)}
            placeholder={t("board.card.titlePlaceholder")}
            maxLength={180}
            required
            readOnly={!editable}
          />
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="card-description">{t("board.card.description")}</label>
            <textarea
              id="card-description"
              value={draft.description}
              onChange={event => set("description", event.target.value)}
              placeholder={t("board.card.descriptionPlaceholder")}
              readOnly={!editable}
              rows={4}
            />
          </div>
          <div className="section-title">
            <Icon name="checklist" size={15} />
            {t("board.card.checklist")}
            {draft.checklist.length > 0 && (
              <span className="subtle">
                {draft.checklist.filter(item => item.done).length}/{draft.checklist.length}
              </span>
            )}
          </div>
          <div className="checklist">
            {draft.checklist.map((item, index) => (
              <div key={item.id} className={`checklist-item ${item.done ? "done" : ""}`}>
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={!editable}
                  aria-label={item.text}
                  onChange={event =>
                    set(
                      "checklist",
                      draft.checklist.map((entry, position) => (position === index ? { ...entry, done: event.target.checked } : entry)),
                    )
                  }
                />
                <input
                  type="text"
                  value={item.text}
                  readOnly={!editable}
                  aria-label={t("board.card.checklistItem")}
                  onChange={event =>
                    set(
                      "checklist",
                      draft.checklist.map((entry, position) => (position === index ? { ...entry, text: event.target.value } : entry)),
                    )
                  }
                  maxLength={300}
                />
                {editable && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("common.delete")}
                    onClick={() =>
                      set(
                        "checklist",
                        draft.checklist.filter((_, position) => position !== index),
                      )
                    }
                  >
                    <Icon name="x" size={15} />
                  </button>
                )}
              </div>
            ))}
            {editable && draft.checklist.length < 50 && (
              <div className="checklist-item">
                <Icon name="plus" size={15} />
                <input
                  type="text"
                  value={newItem}
                  placeholder={t("board.card.addChecklistItem")}
                  aria-label={t("board.card.addChecklistItem")}
                  onChange={event => setNewItem(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (newItem.trim()) {
                        set("checklist", [...draft.checklist, { id: crypto.randomUUID().slice(0, 12), text: newItem.trim(), done: false }]);
                        setNewItem("");
                      }
                    }
                  }}
                  maxLength={300}
                />
              </div>
            )}
          </div>
          {!isNew && (
            <>
              <div className="section-title">
                <Icon name="message" size={15} />
                {t("board.comments.title")}
              </div>
              <div className="comments">
                {comments.map(item => (
                  <div key={item.id} className="comment">
                    <Avatar name={item.user.name} size="sm" />
                    <div className="comment-body">
                      <div className="comment-meta">
                        <strong>{item.user.name}</strong>
                        <span>
                          {new Date(item.createdAt).toLocaleString(tag, {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {(item.user.id === meId || canManage) && (
                          <button type="button" className="text-button" onClick={() => void removeComment(item.id)}>
                            {t("common.delete")}
                          </button>
                        )}
                      </div>
                      <div className="comment-text">{renderComment(item.body, members)}</div>
                    </div>
                  </div>
                ))}
                {!comments.length && <p className="subtle">{t("board.comments.empty")}</p>}
                {canComment && (
                  <div className="comment-form">
                    <label htmlFor="comment-input" className="sr-only">
                      {t("board.comments.add")}
                    </label>
                    <textarea
                      id="comment-input"
                      value={comment}
                      onChange={event => setComment(event.target.value)}
                      placeholder={t("board.comments.placeholder")}
                      maxLength={5000}
                      onKeyDown={event => {
                        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void postComment(event);
                      }}
                    />
                    <div className="row">
                      <span className="subtle">{t("board.comments.mention")}</span>
                      <div className="mention-list">
                        {members
                          .filter(member => member.id !== meId)
                          .slice(0, 8)
                          .map(member => (
                            <button key={member.id} type="button" className="chip" onClick={() => mention(member)}>
                              @{member.name}
                            </button>
                          ))}
                      </div>
                      <span className="spacer" />
                      <button
                        type="button"
                        className="btn sm primary"
                        disabled={!comment.trim()}
                        onClick={event => void postComment(event)}
                      >
                        {t("board.comments.send")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <aside className="card-side">
          <div className="field">
            <label htmlFor="card-column">{t("board.card.column")}</label>
            <select id="card-column" value={draft.columnId} disabled={!editable} onChange={event => set("columnId", event.target.value)}>
              {columns.map(column => (
                <option key={column.id} value={column.id}>
                  {column.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="card-priority">{t("board.card.priority")}</label>
            <select
              id="card-priority"
              value={draft.priority}
              disabled={!editable}
              onChange={event => set("priority", event.target.value as Card["priority"])}
            >
              {(["LOW", "NORMAL", "HIGH", "URGENT"] as const).map(value => (
                <option key={value} value={value}>
                  {t(`priority.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="card-due">{t("board.card.dueDate")}</label>
            <input
              id="card-due"
              type="date"
              value={draft.dueDate}
              readOnly={!editable}
              onChange={event => set("dueDate", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="card-tags">{t("board.card.tags")}</label>
            <input
              id="card-tags"
              value={draft.tags}
              readOnly={!editable}
              onChange={event => set("tags", event.target.value)}
              placeholder={t("board.card.tagsPlaceholder")}
            />
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label" style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>
              {t("board.card.assignees")}
            </legend>
            <div className="assignee-picker">
              {writers.map(member => (
                <label key={member.id} className="check">
                  <input
                    type="checkbox"
                    disabled={!editable}
                    checked={draft.assigneeIds.includes(member.id)}
                    onChange={event =>
                      set(
                        "assigneeIds",
                        event.target.checked ? [...draft.assigneeIds, member.id] : draft.assigneeIds.filter(id => id !== member.id),
                      )
                    }
                  />
                  <Avatar name={member.name} size="sm" />
                  {member.name}
                </label>
              ))}
            </div>
          </fieldset>
          {!isNew && activity.length > 0 && (
            <div>
              <div className="section-title">
                <Icon name="clock" size={15} />
                {t("board.card.history")}
              </div>
              <ul className="card-activity">
                {activity.slice(0, 8).map(item => (
                  <li key={item.id}>
                    {t(`activity.${item.type}`, { actor: item.user.name })} ·{" "}
                    {new Date(item.createdAt).toLocaleDateString(tag, { day: "numeric", month: "short" })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </form>
    </Dialog>
  );
}

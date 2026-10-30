"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useI18n } from "../I18nProvider";
import type { PreviewAction, Proposal, ProposalEdit } from "./types";

type Props = {
  proposal: Proposal;
  busy: boolean;
  boardName: string;
  onApply: (indexes: number[], edits: ProposalEdit[]) => void;
  onDiscard: () => void;
  onClarify: (answer: string) => void;
};

function Change({ change }: { change: PreviewAction["changes"][number] }) {
  const { t, tag } = useI18n();
  const format = (value: string | null) => {
    if (value === null || value === "") return t("board.proposal.none");
    if (change.field === "dueDate") return new Date(value).toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "short" });
    if (change.field === "priority") return t(`priority.${value}`);
    return value;
  };
  return (
    <span className="change">
      {change.field === "assignees" ? t("board.card.assignees") : t(`board.proposal.field.${change.field}`)}: {change.from !== null && <del>{format(change.from)}</del>}
      {change.from !== null && " → "}
      <ins>{format(change.to)}</ins>
    </span>
  );
}

/** Diff preview of an AI proposal: nothing is written until the person applies it (all or selected actions). */
export function ProposalPanel({ proposal, busy, boardName, onApply, onDiscard, onClarify }: Props) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(proposal.actions.map(action => action.index)));
  useEffect(() => setSelected(new Set(proposal.actions.map(action => action.index))), [proposal]);
  const [editing, setEditing] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Record<number, { title: string; description: string; tags: string }>>({});
  useEffect(() => {
    setEditing(new Set());
    setEdits({});
  }, [proposal]);
  const invalid = Object.entries(edits).some(
    ([index, edit]) =>
      selected.has(Number(index)) &&
      (!edit.title.trim() ||
        edit.tags
          .split(",")
          .map(tag => tag.trim())
          .filter(Boolean)
          .some(tag => tag.length > 40) ||
        edit.tags
          .split(",")
          .map(tag => tag.trim())
          .filter(Boolean).length > 20),
  );
  const describe = (action: PreviewAction) => {
    switch (action.action) {
      case "create":
        return (
          <>
            {t("board.proposal.create")} <b>“{edits[action.index]?.title ?? action.newTitle}”</b>
            {action.toColumn && (
              <>
                {" "}
                {t("board.proposal.in")} <b>{action.toColumn}</b>
              </>
            )}
          </>
        );
      case "archive":
        return (
          <>
            {t("board.proposal.archive")} <b>“{action.cardTitle}”</b>
          </>
        );
      case "move":
        return (
          <>
            {t("board.proposal.move")} <b>“{action.cardTitle}”</b> {t("board.proposal.to")} <b>{action.toColumn}</b>
          </>
        );
      default:
        return (
          <>
            {t("board.proposal.update")} <b>“{action.cardTitle}”</b>
            {action.toColumn && (
              <>
                {" "}
                {t("board.proposal.andMove")} <b>{action.toColumn}</b>
              </>
            )}
          </>
        );
    }
  };
  const kindIcon = (action: PreviewAction) =>
    action.action === "create" ? "plus" : action.action === "archive" ? "archive" : action.toColumn ? "arrowRight" : "edit";
  return (
    <section className="proposal" aria-label={t("board.proposal.label")} aria-live="polite">
      <div className="proposal-head">
        <span className="ai-icon">
          <Icon name="sparkles" />
        </span>
        <div>
          <span className="eyebrow">{t("board.proposal.eyebrow")}</span>
          <strong>
            {proposal.clarification
              ? t("board.proposal.needsClarification")
              : proposal.actions.length
                ? t("board.proposal.title", { count: proposal.actions.length })
                : t("board.proposal.noChanges")}
          </strong>
          {proposal.summary && <p>{proposal.summary}</p>}
          <p className="quote">
            {proposal.source === "voice" && <Icon name="mic" size={12} />} “
            {proposal.inputText.length > 220 ? `${proposal.inputText.slice(0, 220)}…` : proposal.inputText}”
          </p>
        </div>
      </div>
      {proposal.clarification && (
        <div className="clarify">
          <p>{proposal.clarification.question}</p>
          <div className="clarify-options">
            {proposal.clarification.options.map(option => (
              <button key={option} type="button" className="chip" disabled={busy} onClick={() => onClarify(option)}>
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
      {proposal.actions.length > 0 && (
        <ul className="proposal-list">
          {proposal.actions.map(action => (
            <li key={action.index} className="proposal-item">
              <input
                type="checkbox"
                checked={selected.has(action.index)}
                aria-label={t("board.proposal.include")}
                onChange={event =>
                  setSelected(current => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(action.index);
                    else next.delete(action.index);
                    return next;
                  })
                }
              />
              <span className={`action-kind ${action.action}`}>
                <Icon name={kindIcon(action)} size={14} />
              </span>
              <div>
                <div className="what">{describe(action)}</div>
                {action.changes.length > 0 && (
                  <div className="changes">
                    {action.changes
                      .filter(change => !edits[action.index] || !["title", "description", "tags"].includes(change.field))
                      .map(change => (
                        <Change key={change.field} change={change} />
                      ))}
                  </div>
                )}
                {action.editable && (
                  <button
                    type="button"
                    className="btn sm proposal-edit-toggle"
                    disabled={busy}
                    onClick={() => {
                      setEdits(current =>
                        current[action.index]
                          ? current
                          : { ...current, [action.index]: { ...action.editable!, tags: action.editable!.tags.join(", ") } },
                      );
                      setEditing(current => {
                        const next = new Set(current);
                        if (next.has(action.index)) next.delete(action.index);
                        else next.add(action.index);
                        return next;
                      });
                    }}
                  >
                    {t(editing.has(action.index) ? "board.proposal.doneEditing" : "board.proposal.edit")}
                  </button>
                )}
                {editing.has(action.index) && edits[action.index] && (
                  <div className="proposal-editor">
                    {(["title", "description", "tags"] as const).map(field => (
                      <label key={field}>
                        {t(`board.proposal.field.${field}`)}
                        {field === "description" ? (
                          <textarea
                            value={edits[action.index][field]}
                            maxLength={10000}
                            onChange={event =>
                              setEdits(current => ({
                                ...current,
                                [action.index]: { ...current[action.index], [field]: event.target.value },
                              }))
                            }
                          />
                        ) : (
                          <input
                            type="text"
                            value={edits[action.index][field]}
                            maxLength={field === "title" ? 180 : undefined}
                            onChange={event =>
                              setEdits(current => ({
                                ...current,
                                [action.index]: { ...current[action.index], [field]: event.target.value },
                              }))
                            }
                          />
                        )}
                      </label>
                    ))}
                    <small>{t("board.proposal.tagsHint")}</small>
                  </div>
                )}
                {!editing.has(action.index) && edits[action.index] && (
                  <div className="changes">
                    <span className="change">
                      {t("board.proposal.field.title")}: {edits[action.index].title}
                    </span>
                    <span className="change">
                      {t("board.proposal.field.description")}: {edits[action.index].description || t("board.proposal.none")}
                    </span>
                    <span className="change">
                      {t("board.proposal.field.tags")}: {edits[action.index].tags || t("board.proposal.none")}
                    </span>
                  </div>
                )}
                {action.checklist && <div className="changes"><strong>{t("board.card.checklist")}</strong><ul>{action.checklist.map((item, index) => <li key={index}>{item.done ? "✓ " : ""}{item.text}{item.suggested && <span className="badge">{locale === "it" ? "Suggerito dall’IA" : "AI suggestion"}</span>}</li>)}</ul></div>}
                {action.reason && <div className="why">{action.reason}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="proposal-foot">
        <span className="subtle">{t("board.proposal.reversible")}</span>
        {invalid && (
          <span className="error" role="alert">
            {t("board.proposal.invalidEdit")}
          </span>
        )}
        <span className="spacer" />
        <button type="button" className="btn" onClick={onDiscard} disabled={busy}>
          {proposal.actions.length ? t("board.proposal.discard") : t("common.close")}
        </button>
        {proposal.actions.length > 0 && (
          <button
            type="button"
            className="btn primary"
            disabled={busy || selected.size === 0 || invalid}
            onClick={() =>
              onApply(
                [...selected].sort((a, b) => a - b),
                Object.entries(edits)
                  .filter(([index]) => selected.has(Number(index)))
                  .map(([index, edit]) => ({
                    index: Number(index),
                    title: edit.title.trim(),
                    description: edit.description,
                    tags: edit.tags
                      .split(",")
                      .map(tag => tag.trim())
                      .filter(Boolean),
                  })),
              )
            }
          >
            {busy ? <span className="spinner" /> : <Icon name="check" size={16} />}
            {selected.size === proposal.actions.length
              ? t("board.proposal.applyAll", { board: boardName })
              : t("board.proposal.applySelected", { count: selected.size, board: boardName })}
          </button>
        )}
      </div>
    </section>
  );
}

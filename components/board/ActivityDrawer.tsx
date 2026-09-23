"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useI18n } from "../I18nProvider";
import { api, useFeedback } from "../ui";

type Change = { cardId: string | null; type: string; title: string; fromColumn: string | null; toColumn: string | null };
type Update = {
  id: string;
  kind: "ai";
  inputText: string;
  summary: string;
  source: string;
  createdAt: string;
  undoneAt: string | null;
  user: { id: string; name: string };
  changes: Change[];
};
type Event = {
  id: string;
  kind: "manual";
  type: string;
  createdAt: string;
  user: { id: string; name: string };
  entityId: string | null;
  title: string;
  toColumn: string | null;
};

/** Who changed what, when. AI updates list their card changes, which is exactly what "Undo" reverts. */
export function ActivityDrawer({
  slug,
  canWrite,
  onClose,
  onChanged,
  onOpenCard,
}: {
  slug: string;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
  onOpenCard: (cardId: string) => void;
}) {
  const { t, tag } = useI18n();
  const { confirm, toast } = useFeedback();
  const [filter, setFilter] = useState<"all" | "ai" | "manual">("all");
  const [items, setItems] = useState<Array<Update | Event> | null>(null);
  const load = useCallback(async () => {
    const response = await api<{ updates: Update[]; events: Event[] }>(`/api/workspaces/${slug}/activity?filter=${filter}`);
    if (response.ok) setItems([...response.data.updates, ...response.data.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, [slug, filter]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changeLine = (change: Change) => {
    if (change.type === "AI_CARD_CREATED") return t("activity.undo.created", { title: change.title });
    if (change.type === "AI_CARD_ARCHIVED") return t("activity.undo.archived", { title: change.title });
    if (change.toColumn) return t("activity.undo.moved", { title: change.title, from: change.fromColumn || "?", to: change.toColumn });
    return t("activity.undo.updated", { title: change.title });
  };

  async function undo(update: Update) {
    const ok = await confirm({
      title: t("activity.undoTitle"),
      message: `${t("activity.undoExplain")}\n\n${update.changes.map(change => `• ${changeLine(change)}`).join("\n")}`,
      confirmLabel: t("activity.undo.cta"),
    });
    if (!ok) return;
    const response = await api(`/api/workspaces/${slug}/updates/${update.id}/undo`, { method: "POST", json: {} });
    if (!response.ok) {
      toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
      return;
    }
    toast({ message: t("activity.undone") });
    onChanged();
    void load();
  }

  const when = (value: string) =>
    new Date(value).toLocaleString(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={t("activity.title")}>
        <div className="drawer-head">
          <Icon name="activity" />
          <h2>{t("activity.title")}</h2>
          <span className="spacer" />
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </div>
        <div className="drawer-body">
          <div className="segmented" role="tablist" aria-label={t("activity.filter")}>
            {(["all", "ai", "manual"] as const).map(value => (
              <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>
                {t(`activity.filters.${value}`)}
              </button>
            ))}
          </div>
          {!items && (
            <>
              <div className="skeleton" style={{ height: 88 }} />
              <div className="skeleton" style={{ height: 88 }} />
            </>
          )}
          {items && !items.length && <p className="subtle">{t("activity.empty")}</p>}
          {items?.map(item =>
            item.kind === "ai" ? (
              <article key={item.id} className={`activity-item ai ${item.undoneAt ? "undone" : ""}`}>
                <div className="activity-top">
                  <Icon name={item.source === "voice" ? "mic" : "sparkles"} size={14} />
                  <strong>{item.user.name}</strong>
                  <span>{when(item.createdAt)}</span>
                  <span className="spacer" />
                  {item.undoneAt ? <span className="badge">{t("activity.undoneBadge")}</span> : <span className="badge signal">AI</span>}
                </div>
                <div className="activity-input">“{item.inputText}”</div>
                {item.summary && <p className="subtle">{item.summary}</p>}
                {item.changes.length > 0 && (
                  <ul className="activity-changes">
                    {item.changes.map((change, index) => (
                      <li key={index}>
                        {change.cardId && !item.undoneAt ? (
                          <button type="button" className="text-button" onClick={() => onOpenCard(change.cardId!)}>
                            {change.title}
                          </button>
                        ) : (
                          change.title
                        )}
                        {change.toColumn
                          ? ` → ${change.toColumn}`
                          : change.type === "AI_CARD_CREATED"
                            ? ` (${t("activity.new")})`
                            : change.type === "AI_CARD_ARCHIVED"
                              ? ` (${t("activity.archivedLabel")})`
                              : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {canWrite && !item.undoneAt && item.changes.length > 0 && (
                  <div>
                    <button type="button" className="btn sm" onClick={() => void undo(item)}>
                      <Icon name="undo" size={14} />
                      {t("activity.undo.cta")}
                    </button>
                  </div>
                )}
              </article>
            ) : (
              <article key={item.id} className="activity-item">
                <div className="activity-top">
                  <Icon name="user" size={14} />
                  <strong>{item.user.name}</strong>
                  <span>{when(item.createdAt)}</span>
                </div>
                <div className="activity-input">
                  {t(`activity.${item.type}`, { actor: item.user.name })}
                  {item.title && (
                    <>
                      {" "}
                      ·{" "}
                      {item.entityId && (item.type.startsWith("CARD") || item.type === "COMMENT_CREATED") ? (
                        <button type="button" className="text-button" onClick={() => onOpenCard(item.entityId!)}>
                          {item.title}
                        </button>
                      ) : (
                        item.title
                      )}
                    </>
                  )}
                  {item.toColumn && ` → ${item.toColumn}`}
                </div>
              </article>
            ),
          )}
        </div>
      </aside>
    </>
  );
}

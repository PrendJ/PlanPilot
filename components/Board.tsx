"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUpdateBlocker } from "./PwaProvider";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { api, MenuButton, useFeedback } from "./ui";
import { Composer, type ComposerHandle } from "./board/Composer";
import { ProposalPanel } from "./board/ProposalPanel";
import { KanbanView } from "./board/KanbanView";
import { ListView } from "./board/ListView";
import { CalendarView } from "./board/CalendarView";
import { CardDialog } from "./board/CardDialog";
import { ActivityDrawer } from "./board/ActivityDrawer";
import { dueState, isDoneColumn, tagsOf, type BoardData, type Card, type Proposal } from "./board/types";
import { WELCOME_EXAMPLES } from "@/lib/welcome";

type View = "kanban" | "list" | "calendar";
type DueFilter = "all" | "overdue" | "week" | "none";

function isTyping(target: EventTarget | null) {
  const node = target as HTMLElement | null;
  return Boolean(node && (node.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName)));
}

export function Board({ slug }: { slug: string }) {
  const { t, locale } = useI18n();
  const { toast } = useFeedback();
  const router = useRouter();
  const search = useSearchParams();
  const [data, setData] = useState<BoardData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [archived, setArchived] = useState(false);
  const [view, setView] = useState<View>("kanban");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("ALL");
  const [assignee, setAssignee] = useState("ALL");
  const [due, setDue] = useState<DueFilter>("all");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [applying, setApplying] = useState(false);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ card: Card | null; columnId?: string } | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const composer = useRef<ComposerHandle>(null);
  const revision = useRef(-1);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restoredProposal = useRef(false);

  const load = useCallback(async () => {
    const response = await api<BoardData>(`/api/workspaces/${slug}/board${archived ? "?archived=1" : ""}`);
    if (!response.ok) {
      if (response.data.code === "TWO_FACTOR_SETUP_REQUIRED") {
        router.push("/account?require2fa=1#security");
        return null;
      }
      setLoadError(response.data.error || t("errors.SERVER_ERROR"));
      return null;
    }
    revision.current = response.data.workspace.revision;
    setData(response.data);
    setLoadError("");
    return response.data;
  }, [slug, archived, router, t]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`boardcue:view:${slug}`);
      if (saved === "list" || saved === "calendar" || saved === "kanban") setView(saved);
    } catch {
      /* storage unavailable */
    }
  }, [slug]);
  useEffect(() => {
    try {
      localStorage.setItem(`boardcue:view:${slug}`, view);
    } catch {
      /* storage unavailable */
    }
  }, [slug, view]);
  useEffect(() => {
    if (search.get("welcome") === "1") setWelcome(true);
  }, [search]);
  // PWA shortcut: /app/quick → ?dictate=1 opens the microphone as soon as the board is ready.
  const dictateRequested = useRef(false);
  useEffect(() => {
    if (!data || dictateRequested.current || search.get("dictate") !== "1") return;
    dictateRequested.current = true;
    if (data.workspace.canWrite && data.workspace.dictationEnabled) setTimeout(() => composer.current?.toggleMic(), 300);
  }, [data, search]);

  // Live updates: the server pushes the board revision; refetch when it moves.
  useEffect(() => {
    if (typeof EventSource === "undefined") {
      const timer = setInterval(() => void load(), 20_000);
      return () => clearInterval(timer);
    }
    const source = new EventSource(`/api/workspaces/${slug}/events`);
    source.addEventListener("revision", event => {
      const next = Number((event as MessageEvent).data);
      if (next !== revision.current) {
        clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => void load(), 250);
      }
    });
    source.addEventListener("gone", () => {
      source.close();
      router.push("/app");
    });
    return () => {
      source.close();
      clearTimeout(reloadTimer.current);
    };
  }, [slug, load, router]);

  // Restore a pending proposal (e.g. after a reload) once.
  useEffect(() => {
    if (!data?.pendingProposalId || proposal || restoredProposal.current) return;
    restoredProposal.current = true;
    void api<{ proposal: Proposal }>(`/api/workspaces/${slug}/proposals/${data.pendingProposalId}`).then(response => {
      if (response.ok && response.data.proposal.status === "PENDING") setProposal(response.data.proposal);
    });
  }, [data?.pendingProposalId, proposal, slug]);

  // Deep link ?card=ID (search results, notifications).
  useEffect(() => {
    const id = search.get("card");
    if (!id || !data) return;
    const card = data.columns.flatMap(column => column.cards).find(item => item.id === id);
    if (card) setEditing({ card });
  }, [search, data]);

  // The composer is unmounted while a proposal is shown: hand text back through its saved draft.
  const restoreDraft = useCallback(
    (text: string) => {
      try {
        sessionStorage.setItem(`boardcue:draft:${slug}`, text);
      } catch {
        /* storage unavailable */
      }
    },
    [slug],
  );

  const flash = useCallback((ids: string[]) => {
    setHighlighted(new Set(ids));
    setTimeout(() => setHighlighted(new Set()), 8000);
  }, []);

  const applyResult = useCallback(
    async (receipt: { updateId: string; applied: number }, before: BoardData | null) => {
      const fresh = await load();
      if (fresh) {
        const previous = new Map((before?.columns.flatMap(column => column.cards) || []).map(card => [card.id, card.version]));
        flash(
          fresh.columns
            .flatMap(column => column.cards)
            .filter(card => previous.get(card.id) !== card.version)
            .map(card => card.id),
        );
      }
      toast({
        message: t("board.proposal.applied", { count: receipt.applied }),
        action: {
          label: t("activity.undo.cta"),
          onClick: async () => {
            const response = await api(`/api/workspaces/${slug}/updates/${receipt.updateId}/undo`, { method: "POST", json: {} });
            if (response.ok) {
              toast({ message: t("activity.undone") });
              void load();
            } else toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
          },
        },
      });
    },
    [load, flash, toast, t, slug],
  );

  const onResult = useCallback(
    (result: { proposal: Proposal; receipt?: { updateId: string; applied: number } }) => {
      setWelcome(false);
      if (result.receipt) {
        setProposal(null);
        void applyResult(result.receipt, data);
        return;
      }
      setProposal(result.proposal);
    },
    [applyResult, data],
  );

  async function apply(indexes: number[]) {
    if (!proposal) return;
    setApplying(true);
    const before = data;
    const response = await api<{ receipt: { updateId: string; applied: number } }>(
      `/api/workspaces/${slug}/proposals/${proposal.id}/apply`,
      { method: "POST", json: { actionIndexes: indexes } },
    );
    setApplying(false);
    if (!response.ok) {
      toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
      if (["PROPOSAL_STALE", "PROPOSAL_EXPIRED", "NOT_FOUND"].includes(response.data.code || "")) {
        restoreDraft(proposal.inputText);
        setProposal(null);
        void load();
      }
      return;
    }
    setProposal(null);
    await applyResult(response.data.receipt, before);
  }

  async function discard() {
    if (!proposal) return;
    const current = proposal;
    restoreDraft(current.inputText);
    setProposal(null);
    if (current.actions.length) await api(`/api/workspaces/${slug}/proposals/${current.id}`, { method: "DELETE" });
  }

  function clarify(answer: string) {
    if (!proposal) return;
    const text = `${proposal.inputText}\n(${t("board.proposal.clarifiedAs")}: ${answer})`;
    void api(`/api/workspaces/${slug}/proposals/${proposal.id}`, { method: "DELETE" });
    restoreDraft(text);
    setProposal(null);
  }

  const moveCard = useCallback(
    async (card: Card, columnId: string, index?: number) => {
      // Optimistic: move locally, then persist; on failure reload the truth.
      setData(current => {
        if (!current) return current;
        const columns = current.columns.map(column => ({ ...column, cards: column.cards.filter(item => item.id !== card.id) }));
        const target = columns.find(column => column.id === columnId);
        if (target) {
          const cards = [...target.cards];
          cards.splice(index ?? 0, 0, { ...card, columnId });
          target.cards = cards;
        }
        return { ...current, columns };
      });
      const response = await api(`/api/workspaces/${slug}/cards/${card.id}`, {
        method: "PATCH",
        json: { columnId, ...(index !== undefined && { index }) },
      });
      if (!response.ok) toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
      void load();
    },
    [slug, load, toast, t],
  );

  const archiveCard = useCallback(
    async (card: Card, value: boolean) => {
      const response = await api(`/api/workspaces/${slug}/cards/${card.id}`, { method: "PATCH", json: { archived: value } });
      if (!response.ok) {
        toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
        return;
      }
      void load();
      toast({
        message: value ? t("board.card.archived", { title: card.title }) : t("board.card.restored"),
        action: value
          ? {
              label: t("activity.undo.cta"),
              onClick: async () => {
                await api(`/api/workspaces/${slug}/cards/${card.id}`, { method: "PATCH", json: { archived: false } });
                void load();
              },
            }
          : undefined,
      });
    },
    [slug, load, toast, t],
  );

  // Keyboard shortcuts: "/" write, "m" dictate, "n" new card.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || editing || document.querySelector(".dialog, .drawer"))
        return;
      if (event.key === "/") {
        event.preventDefault();
        composer.current?.focus();
      }
      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        composer.current?.toggleMic();
      }
      if (event.key.toLowerCase() === "n" && data?.workspace.canWrite) {
        event.preventDefault();
        setEditing({ card: null, columnId: data.columns[0]?.id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, data]);

  useUpdateBlocker(`board:${slug}`, Boolean(proposal) || Boolean(editing) || applying);

  const visible = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    const now = new Date();
    const week = now.getTime() + 7 * 86400000;
    return data.columns.map((column, index) => ({
      ...column,
      cards: column.cards.filter(card => {
        if (needle && !`${card.title} ${card.description} ${tagsOf(card).join(" ")}`.toLowerCase().includes(needle)) return false;
        if (priority !== "ALL" && card.priority !== priority) return false;
        if (assignee === "ME" && !card.assignees.some(item => item.user.id === data.me.id)) return false;
        if (assignee === "NONE" && card.assignees.length) return false;
        if (!["ALL", "ME", "NONE"].includes(assignee) && !card.assignees.some(item => item.user.id === assignee)) return false;
        if (due === "none" && card.dueDate) return false;
        if (due === "overdue" && dueState(card.dueDate, now, isDoneColumn(column, index, data.columns.length)) !== "overdue") return false;
        if (due === "week" && (!card.dueDate || new Date(card.dueDate).getTime() > week)) return false;
        return true;
      }),
    }));
  }, [data, query, priority, assignee, due]);

  if (!data)
    return loadError ? (
      <div className="board-page">
        <div className="notice error">
          <Icon name="alert" />
          <div className="notice-body">{loadError}</div>
          <button type="button" className="btn sm" onClick={() => void load()}>
            {t("common.retry")}
          </button>
        </div>
      </div>
    ) : (
      <BoardSkeleton />
    );

  const { workspace, quota } = data;
  const filtersActive = query || priority !== "ALL" || assignee !== "ALL" || due !== "all";
  const quotaClass = quota
    ? quota.status === "PAUSED"
      ? "paused"
      : quota.status === "CRITICAL"
        ? "crit"
        : quota.status === "WARNING"
          ? "warn"
          : ""
    : "";
  const canComment = !workspace.readOnly;
  return (
    <div className="board-page">
      <section className="board-toolbar" aria-label={t("board.toolbar")}>
        <div className="board-title">
          <h1>{workspace.name}</h1>
          {workspace.role === "GUEST" && <span className="badge outline">{t("roles.GUEST")}</span>}
        </div>
        <div className="segmented" role="tablist" aria-label={t("board.views.label")}>
          {(["kanban", "list", "calendar"] as const).map(value => (
            <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}>
              <Icon name={value === "kanban" ? "kanban" : value === "list" ? "list" : "calendar"} size={15} />
              <span className="hide-mobile"> {t(`board.views.${value}`)}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        {quota && (
          <Link
            href="/account#teams"
            className={`quota-chip ${quotaClass}`}
            title={
              quota.resetsAt
                ? t("board.quota.resets", { date: new Date(quota.resetsAt).toLocaleDateString(locale === "en" ? "en-GB" : "it-IT") })
                : undefined
            }
          >
            <Icon name="sparkles" size={14} />
            <span>{quota.remaining === null ? t("board.quota.unlimited") : t("board.quota.remaining", { count: quota.remaining })}</span>
            <span className={`meter ${quotaClass === "warn" ? "warn" : quotaClass ? "crit" : ""}`}>
              <i style={{ width: `${quota.percent}%` }} />
            </span>
          </Link>
        )}
        <button type="button" className="btn ghost" onClick={() => setActivityOpen(true)}>
          <Icon name="activity" size={16} />
          <span className="hide-mobile">{t("activity.title")}</span>
        </button>
        <MenuButton label={t("board.more")} icon="more">
          {close => (
            <>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  close();
                  setArchived(value => !value);
                }}
              >
                <Icon name="archive" />
                {archived ? t("board.showActive") : t("board.showArchived")}
              </button>
              <div className="menu-label">{t("board.export.label")}</div>
              <a className="menu-item" href={`/api/workspaces/${slug}/export?format=csv`} onClick={close}>
                <Icon name="download" />
                {t("board.export.csv")}
              </a>
              <a className="menu-item" href={`/api/workspaces/${slug}/export?format=json`} onClick={close}>
                <Icon name="download" />
                {t("board.export.json")}
              </a>
              <a className="menu-item" href={`/api/workspaces/${slug}/export?format=md`} onClick={close}>
                <Icon name="download" />
                {t("board.export.md")}
              </a>
              <Link className="menu-item" href={`/app/${slug}/print`} onClick={close}>
                <Icon name="file" />
                {t("board.export.print")}
              </Link>
              {workspace.canManage && (
                <>
                  <div className="menu-sep" />
                  <Link className="menu-item" href={`/app/${slug}/settings`} onClick={close}>
                    <Icon name="settings" />
                    {t("board.settings")}
                  </Link>
                </>
              )}
            </>
          )}
        </MenuButton>
      </section>

      {workspace.readOnly && (
        <div className="notice warning readonly-banner" role="status">
          <Icon name="lock" />
          <div className="notice-body">
            <strong>{t("board.readOnly.title")}</strong> {t("board.readOnly.body")}
          </div>
          <Link className="btn sm primary" href="/pricing">
            {t("board.readOnly.cta")}
          </Link>
        </div>
      )}

      {workspace.canWrite && !archived && (
        <>
          {welcome && (
            <div className="coach" role="status">
              <Icon name="sparkles" />
              <div>
                <strong>{t("board.welcome.title")}</strong>
                <p>{t("board.welcome.body")}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setWelcome(false)} aria-label={t("common.close")}>
                <Icon name="x" />
              </button>
            </div>
          )}
          {quota?.status === "PAUSED" && !workspace.readOnly && (
            <div className="notice warning">
              <Icon name="alert" />
              <div className="notice-body">{t("errors.QUOTA_EXHAUSTED")}</div>
              <Link className="btn sm" href="/account#teams">
                {t("board.quota.addPack")}
              </Link>
            </div>
          )}
          {proposal ? (
            <ProposalPanel
              proposal={proposal}
              busy={applying}
              onApply={indexes => void apply(indexes)}
              onDiscard={() => void discard()}
              onClarify={clarify}
            />
          ) : (
            <Composer
              ref={composer}
              slug={slug}
              disabled={!workspace.canWrite}
              dictationEnabled={workspace.dictationEnabled}
              quotaPaused={quota?.status === "PAUSED"}
              autoSendDictation={data.me.autoSendDictation}
              examples={welcome ? WELCOME_EXAMPLES[locale] : undefined}
              onResult={onResult}
              onError={message => toast({ message, tone: "error" })}
            />
          )}
        </>
      )}

      <section className="board-filters" aria-label={t("board.filters.label")}>
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t("board.filters.search")}
          aria-label={t("board.filters.search")}
        />
        <select value={priority} onChange={event => setPriority(event.target.value)} aria-label={t("board.filters.priority")}>
          <option value="ALL">{t("board.filters.allPriorities")}</option>
          {(["URGENT", "HIGH", "NORMAL", "LOW"] as const).map(value => (
            <option key={value} value={value}>
              {t(`priority.${value}`)}
            </option>
          ))}
        </select>
        <select value={assignee} onChange={event => setAssignee(event.target.value)} aria-label={t("board.filters.assignee")}>
          <option value="ALL">{t("board.filters.everyone")}</option>
          <option value="ME">{t("board.filters.me")}</option>
          <option value="NONE">{t("board.filters.unassigned")}</option>
          {data.members
            .filter(member => member.id !== data.me.id && member.role !== "GUEST")
            .map(member => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
        </select>
        <select value={due} onChange={event => setDue(event.target.value as DueFilter)} aria-label={t("board.filters.due")}>
          <option value="all">{t("board.filters.anyDate")}</option>
          <option value="overdue">{t("board.filters.overdue")}</option>
          <option value="week">{t("board.filters.thisWeek")}</option>
          <option value="none">{t("board.filters.noDate")}</option>
        </select>
        {filtersActive && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setQuery("");
              setPriority("ALL");
              setAssignee("ALL");
              setDue("all");
            }}
          >
            {t("board.filters.clear")}
          </button>
        )}
        <span className="spacer" />
        {archived && (
          <span className="badge warning">
            <Icon name="archive" size={12} />
            {t("board.archivedView")}
          </span>
        )}
        {workspace.canWrite && !archived && (
          <button type="button" className="btn" onClick={() => setEditing({ card: null, columnId: data.columns[0]?.id })}>
            <Icon name="plus" size={16} />
            {t("board.newCard")}
          </button>
        )}
      </section>

      {view === "kanban" && (
        <KanbanView
          columns={visible}
          highlighted={highlighted}
          canWrite={workspace.canWrite}
          archivedView={archived}
          onOpen={card => setEditing({ card })}
          onMove={(card, columnId, index) => void moveCard(card, columnId, index)}
          onArchive={(card, value) => void archiveCard(card, value)}
          onAdd={columnId => setEditing({ card: null, columnId })}
        />
      )}
      {view === "list" && <ListView columns={visible} onOpen={card => setEditing({ card })} />}
      {view === "calendar" && <CalendarView columns={visible} onOpen={card => setEditing({ card })} />}

      {editing && (
        <CardDialog
          key={editing.card?.id || `new-${editing.columnId}`}
          slug={slug}
          card={editing.card}
          initialColumnId={editing.columnId}
          columns={data.columns}
          members={data.members}
          meId={data.me.id}
          canWrite={workspace.canWrite}
          canComment={canComment}
          canManage={workspace.canManage}
          onClose={() => {
            setEditing(null);
            if (search.get("card")) router.replace(`/app/${slug}`);
          }}
          onSaved={card => {
            flash([card.id]);
            void load();
          }}
        />
      )}
      {activityOpen && (
        <ActivityDrawer
          slug={slug}
          canWrite={workspace.canWrite}
          onClose={() => setActivityOpen(false)}
          onChanged={() => void load()}
          onOpenCard={cardId => {
            const card = data.columns.flatMap(column => column.cards).find(item => item.id === cardId);
            if (card) {
              setActivityOpen(false);
              setEditing({ card });
            }
          }}
        />
      )}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="board-page" aria-busy="true">
      <div className="skeleton" style={{ height: 32, width: 280 }} />
      <div className="skeleton" style={{ height: 96 }} />
      <div className="kanban">
        {[0, 1, 2, 3].map(index => (
          <div key={index} className="column" style={{ padding: 12, gap: 8 }}>
            <div className="skeleton" style={{ height: 16, width: "50%" }} />
            <div className="skeleton" style={{ height: 72, marginTop: 10 }} />
            <div className="skeleton" style={{ height: 72, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

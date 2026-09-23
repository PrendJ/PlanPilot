"use client";

import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { KanbanView } from "./board/KanbanView";
import { ProposalPanel } from "./board/ProposalPanel";
import type { Card, Column, PreviewAction, Proposal } from "./board/types";
import { planDemoUpdate, type DemoCard, type DemoColumn, type DemoPlan } from "@/lib/demo-planner";

type Seed = { columns: Array<DemoColumn & { description: string }>; cards: DemoCard[]; examples: string[] };

function seed(locale: "it" | "en"): Seed {
  const it = locale === "it";
  const columns: Seed["columns"] = [
    { id: "inbox", title: "Inbox", intent: "inbox", description: it ? "Idee e richieste" : "Ideas and requests" },
    { id: "todo", title: it ? "Da fare" : "To do", intent: "todo", description: "" },
    { id: "doing", title: it ? "In corso" : "In progress", intent: "doing", description: "" },
    { id: "waiting", title: it ? "In attesa" : "Waiting", intent: "waiting", description: "" },
    { id: "done", title: it ? "Fatto" : "Done", intent: "done", description: "" },
  ];
  const soon = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
  const cards: DemoCard[] = it
    ? [
        {
          id: "c1",
          title: "Newsletter di ottobre",
          description: "Testi, immagini e invio alla lista clienti",
          columnId: "doing",
          priority: "NORMAL",
          dueDate: soon(3),
          tags: ["marketing"],
        },
        {
          id: "c2",
          title: "Preventivo per Studio Rossi",
          description: "Sito vetrina + blog",
          columnId: "todo",
          priority: "HIGH",
          dueDate: soon(1),
          tags: ["cliente"],
        },
        {
          id: "c3",
          title: "Accessi al gestionale del cliente",
          description: "Serve la password dell'amministratore",
          columnId: "waiting",
          priority: "NORMAL",
          dueDate: null,
          tags: ["bloccato"],
        },
        {
          id: "c4",
          title: "Foto del nuovo catalogo",
          description: "Shooting in studio",
          columnId: "todo",
          priority: "NORMAL",
          dueDate: null,
          tags: ["contenuti"],
        },
        { id: "c5", title: "Report mensile analytics", description: "", columnId: "inbox", priority: "LOW", dueDate: null, tags: [] },
        {
          id: "c6",
          title: "Test invio email SMTP",
          description: "Configurazione validata",
          columnId: "done",
          priority: "NORMAL",
          dueDate: null,
          tags: [],
        },
      ]
    : [
        {
          id: "c1",
          title: "October newsletter",
          description: "Copy, images and send to the customer list",
          columnId: "doing",
          priority: "NORMAL",
          dueDate: soon(3),
          tags: ["marketing"],
        },
        {
          id: "c2",
          title: "Quote for Rossi Studio",
          description: "Brochure site + blog",
          columnId: "todo",
          priority: "HIGH",
          dueDate: soon(1),
          tags: ["client"],
        },
        {
          id: "c3",
          title: "Access to the client's CRM",
          description: "We need the admin password",
          columnId: "waiting",
          priority: "NORMAL",
          dueDate: null,
          tags: ["blocked"],
        },
        {
          id: "c4",
          title: "Photos for the new catalogue",
          description: "Studio shoot",
          columnId: "todo",
          priority: "NORMAL",
          dueDate: null,
          tags: ["content"],
        },
        { id: "c5", title: "Monthly analytics report", description: "", columnId: "inbox", priority: "LOW", dueDate: null, tags: [] },
        {
          id: "c6",
          title: "SMTP email test",
          description: "Configuration verified",
          columnId: "done",
          priority: "NORMAL",
          dueDate: null,
          tags: [],
        },
      ];
  const examples = it
    ? [
        "Ho finito la newsletter di ottobre",
        "Sono arrivati gli accessi al gestionale, ci sto lavorando",
        "Il preventivo per Studio Rossi va consegnato venerdì, è urgente",
        "Non ho ancora iniziato le foto del catalogo",
      ]
    : [
        "I finished the October newsletter",
        "We got access to the client's CRM, working on it now",
        "The quote for Rossi Studio is due Friday, it's urgent",
        "I haven't started the catalogue photos yet",
      ];
  return { columns, cards, examples };
}

function toCard(card: DemoCard, index: number): Card {
  return {
    ...card,
    archived: false,
    position: index,
    version: 1,
    checklist: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    assignees: [],
    commentCount: 0,
  };
}

/** Public demo: same preview → apply → undo loop as the product, simulated locally (no AI call, no data sent). */
export function DemoBoard() {
  const { t, locale } = useI18n();
  const initial = useMemo(() => seed(locale), [locale]);
  const [cards, setCards] = useState<DemoCard[]>(initial.cards);
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<{ plan: DemoPlan; proposal: Proposal } | null>(null);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<DemoCard[][]>([]);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const columnTitle = (id: string | null) => initial.columns.find(column => column.id === id)?.title ?? null;

  function propose(value = text) {
    const result = planDemoUpdate(value, cards, initial.columns, locale);
    if (!result.actions.length) {
      setMessage(result.summary);
      setPlan(null);
      return;
    }
    const actions: PreviewAction[] = result.actions.map((action, index) => {
      const card = cards.find(item => item.id === action.cardId);
      return {
        index,
        action: action.action,
        cardId: action.cardId,
        cardTitle: card?.title ?? null,
        newTitle: action.action === "create" ? action.title : null,
        fromColumn: card ? columnTitle(card.columnId) : null,
        toColumn: action.targetColumnId && action.targetColumnId !== card?.columnId ? columnTitle(action.targetColumnId) : null,
        changes: [
          ...(action.priority ? [{ field: "priority" as const, from: card?.priority ?? null, to: action.priority }] : []),
          ...(action.dueDate ? [{ field: "dueDate" as const, from: card?.dueDate ?? null, to: action.dueDate }] : []),
        ],
        reason: action.reason,
      };
    });
    setMessage("");
    setPlan({
      plan: result,
      proposal: {
        id: "demo",
        summary: result.summary,
        clarification: null,
        status: "PENDING",
        expiresAt: "",
        inputText: value,
        source: "text",
        actions,
      },
    });
  }

  function apply(indexes: number[]) {
    if (!plan) return;
    setHistory(current => [...current, cards]);
    let next = [...cards];
    const touched: string[] = [];
    plan.plan.actions.forEach((action, index) => {
      if (!indexes.includes(index)) return;
      if (action.action === "create") {
        const id = `n${Date.now()}${index}`;
        next = [
          {
            id,
            title: action.title || "Card",
            description: "",
            columnId: action.targetColumnId || "inbox",
            priority: action.priority || "NORMAL",
            dueDate: action.dueDate,
            tags: ["demo"],
          },
          ...next,
        ];
        touched.push(id);
        return;
      }
      next = next.map(card =>
        card.id === action.cardId
          ? {
              ...card,
              columnId: action.targetColumnId || card.columnId,
              priority: action.priority || card.priority,
              dueDate: action.dueDate || card.dueDate,
            }
          : card,
      );
      if (action.cardId) touched.push(action.cardId);
    });
    // Moved cards go on top of their new column, like in the product.
    next.sort((a, b) => Number(touched.includes(b.id)) - Number(touched.includes(a.id)));
    setCards(next);
    setPlan(null);
    setText("");
    setHighlighted(new Set(touched));
    setTimeout(() => setHighlighted(new Set()), 6000);
    setMessage(t("demo.applied"));
  }

  const columns: Column[] = initial.columns.map((column, position) => ({
    id: column.id,
    title: column.title,
    description: column.description,
    position,
    cards: cards.filter(card => card.columnId === column.id).map(toCard),
  }));
  return (
    <div className="stack" style={{ gap: 14 }}>
      {plan ? (
        <ProposalPanel proposal={plan.proposal} busy={false} onApply={apply} onDiscard={() => setPlan(null)} onClarify={() => undefined} />
      ) : (
        <div className="composer">
          <div className="composer-row">
            <label htmlFor="demo-input" className="sr-only">
              {t("board.composer.label")}
            </label>
            <textarea
              id="demo-input"
              rows={1}
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder={t("demo.placeholder")}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (text.trim()) propose();
                }
              }}
            />
            <div className="composer-actions">
              <button
                type="button"
                className="mic-btn"
                aria-label={t("demo.micDisabled")}
                title={t("demo.micDisabled")}
                onClick={() => setMessage(t("demo.micDisabled"))}
              >
                <Icon name="mic" size={20} />
              </button>
              <button
                type="button"
                className="send-btn"
                disabled={!text.trim()}
                onClick={() => propose()}
                aria-label={t("board.composer.send")}
              >
                <Icon name="send" size={20} />
              </button>
            </div>
          </div>
          <div className="composer-meta">
            <span>
              <Icon name="info" size={13} /> {t("demo.local")}
            </span>
          </div>
          <div className="composer-examples">
            {initial.examples.map(example => (
              <button
                key={example}
                type="button"
                className="chip"
                onClick={() => {
                  setText(example);
                  propose(example);
                }}
              >
                <Icon name="sparkles" size={13} />
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
      {message && (
        <div className="notice info" role="status">
          <Icon name="sparkles" />
          <div className="notice-body">{message}</div>
          {history.length > 0 && (
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setCards(history[history.length - 1]);
                setHistory(current => current.slice(0, -1));
                setMessage(t("activity.undone"));
              }}
            >
              <Icon name="undo" size={14} />
              {t("activity.undo.cta")}
            </button>
          )}
        </div>
      )}
      <KanbanView
        columns={columns}
        highlighted={highlighted}
        canWrite
        archivedView={false}
        onOpen={() => setMessage(t("demo.openCard"))}
        onMove={(card, columnId) => {
          setHistory(current => [...current, cards]);
          setCards(current => current.map(item => (item.id === card.id ? { ...item, columnId } : item)));
        }}
        onArchive={() => setMessage(t("demo.openCard"))}
        onAdd={() => setMessage(t("demo.openCard"))}
      />
      <div className="row">
        <span className="subtle">{t("demo.resetHint")}</span>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            setCards(initial.cards);
            setHistory([]);
            setPlan(null);
            setMessage("");
          }}
        >
          <Icon name="refresh" size={14} />
          {t("demo.reset")}
        </button>
      </div>
    </div>
  );
}

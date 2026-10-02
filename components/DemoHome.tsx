"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { KanbanView } from "./board/KanbanView";
import { ListView } from "./board/ListView";
import { ProposalPanel } from "./board/ProposalPanel";
import type { Card, Column, PreviewAction, Proposal } from "./board/types";
import { planDemoUpdate, type DemoAction, type DemoCard, type DemoColumn } from "@/lib/demo-planner";
import { routeDemoText, type DemoBoardKind, type DemoSegment } from "@/lib/demo-router";

type DemoBoardSeed = { id: string; kind: DemoBoardKind; name: string; columns: DemoColumn[] };
type Cards = Record<string, DemoCard[]>;
type Pending = { id: string; boardId: string; texts: string[]; actions: DemoAction[]; proposal: Proposal };

function at(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(18, 0, 0, 0);
  return date.toISOString();
}

function card(id: string, title: string, columnId: string, extra: Partial<DemoCard> = {}): DemoCard {
  return { id, title, description: "", columnId, priority: "NORMAL", dueDate: null, tags: [], ...extra };
}

/** Two boards, like a new account: work plus "Casa e personale" with the personal preset's states. */
function seed(locale: "it" | "en") {
  const it = locale === "it";
  const boards: DemoBoardSeed[] = [
    {
      id: "work",
      kind: "work",
      name: it ? "Lavoro" : "Work",
      columns: [
        { id: "inbox", title: "Inbox", intent: "inbox" },
        { id: "todo", title: it ? "Da fare" : "To do", intent: "todo" },
        { id: "doing", title: it ? "In corso" : "In progress", intent: "doing" },
        { id: "waiting", title: it ? "In attesa" : "Waiting", intent: "waiting" },
        { id: "done", title: it ? "Completato" : "Done", intent: "done" },
      ],
    },
    {
      id: "home",
      kind: "personal",
      name: it ? "Casa e personale" : "Home and personal",
      columns: [
        { id: "inbox", title: "Inbox", intent: "inbox" },
        { id: "todo", title: it ? "Da fare" : "To do", intent: "todo" },
        { id: "later", title: it ? "Più avanti" : "Later", intent: "later" },
        { id: "waiting", title: it ? "In attesa" : "Waiting", intent: "waiting" },
        { id: "done", title: it ? "Fatto" : "Done", intent: "done" },
      ],
    },
  ];
  const cards: Cards = it
    ? {
        work: [
          card("w1", "Newsletter di ottobre", "doing", {
            description: "Testi, immagini e invio alla lista clienti",
            dueDate: at(3),
            tags: ["marketing"],
          }),
          card("w2", "Preventivo per Studio Rossi", "todo", { description: "Sito vetrina + blog", priority: "HIGH", dueDate: at(1) }),
          card("w3", "Fattura di settembre a Bianchi", "todo", { priority: "HIGH", dueDate: at(-1), tags: ["amministrazione"] }),
          card("w4", "Accessi al gestionale del cliente", "waiting", { description: "Serve la password dell'amministratore" }),
          card("w5", "Foto del nuovo catalogo", "todo", { description: "Shooting in studio", tags: ["contenuti"] }),
          card("w6", "Report mensile analytics", "inbox", { priority: "LOW" }),
          card("w7", "Test invio email SMTP", "done", { description: "Configurazione validata" }),
        ],
        home: [
          card("h1", "Pagare la bolletta della luce", "todo", { dueDate: at(0) }),
          card("h2", "Regalo per il compleanno di Giulia", "todo", { dueDate: at(6) }),
          card("h3", "Prenotare la revisione dell'auto", "later"),
          card("h4", "Rinnovo della carta d'identità", "waiting", { description: "Appuntamento richiesto in Comune" }),
        ],
      }
    : {
        work: [
          card("w1", "October newsletter", "doing", {
            description: "Copy, images and send to the customer list",
            dueDate: at(3),
            tags: ["marketing"],
          }),
          card("w2", "Quote for Rossi Studio", "todo", { description: "Brochure site + blog", priority: "HIGH", dueDate: at(1) }),
          card("w3", "September invoice for Bianchi", "todo", { priority: "HIGH", dueDate: at(-1), tags: ["admin"] }),
          card("w4", "Access to the client's CRM", "waiting", { description: "We need the admin password" }),
          card("w5", "Photos for the new catalogue", "todo", { description: "Studio shoot", tags: ["content"] }),
          card("w6", "Monthly analytics report", "inbox", { priority: "LOW" }),
          card("w7", "SMTP email test", "done", { description: "Configuration verified" }),
        ],
        home: [
          card("h1", "Pay the electricity bill", "todo", { dueDate: at(0) }),
          card("h2", "Birthday gift for Julia", "todo", { dueDate: at(6) }),
          card("h3", "Book the car service", "later"),
          card("h4", "Passport renewal", "waiting", { description: "Appointment requested" }),
        ],
      };
  const examples = it
    ? [
        "Chiama la banca domani e prepara il preventivo per Studio Rossi entro venerdì",
        "Sabato devo tagliare il prato; ho pagato la bolletta della luce",
        "Ho finito la newsletter di ottobre",
        "Sono arrivati gli accessi al gestionale, ci sto lavorando",
        "Devo organizzare la cena di fine anno",
        "Non ho ancora iniziato le foto del catalogo",
      ]
    : [
        "Call the bank tomorrow and prepare the quote for Rossi Studio by Friday",
        "On Saturday I need to mow the lawn; I paid the electricity bill",
        "I finished the October newsletter",
        "We got access to the client's CRM, working on it now",
        "I need to organize the end-of-year dinner",
        "I haven't started the catalogue photos yet",
      ];
  return { boards, cards, examples, voice: examples.slice(0, 2) };
}

function toCard(item: DemoCard, index: number): Card {
  const now = new Date().toISOString();
  return {
    ...item,
    archived: false,
    position: index,
    version: 1,
    checklist: [],
    updatedAt: now,
    createdAt: now,
    assignees: [],
    commentCount: 0,
  };
}

/**
 * Public demo of the home: speak or type freely, BoardCue splits the text across the work and personal boards
 * (or asks where it goes), previews every change, then updates the boards and the "today" list. Everything is
 * simulated in the browser: no AI call, nothing sent.
 */
export function DemoHome() {
  const { t, locale, tag } = useI18n();
  const initial = useMemo(() => seed(locale), [locale]);
  const [cards, setCards] = useState<Cards>(initial.cards);
  const [text, setText] = useState("");
  const [source, setSource] = useState<"text" | "voice">("text");
  const [listening, setListening] = useState(0);
  const [segments, setSegments] = useState<DemoSegment[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Cards[]>([]);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [activeBoard, setActiveBoard] = useState(initial.boards[0].id);
  const [view, setView] = useState<"list" | "kanban">("list");
  const voiceTurn = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = listening > 0 || pending.length > 0;
  const boardOf = (id: string) => initial.boards.find(board => board.id === id)!;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Simulated dictation: a short "listening" phase, then a sample sentence lands in the text box.
  function speak() {
    if (busy) return;
    setMessage("");
    setListening(1);
    timers.current.push(setTimeout(() => setListening(2), 700));
    timers.current.push(
      setTimeout(() => {
        setListening(0);
        setText(initial.voice[voiceTurn.current++ % initial.voice.length]);
        setSource("voice");
        setSegments([]);
        setMessage(t("demo.voiceSimulated"));
      }, 1500),
    );
  }

  function plan(boardId: string, texts: string[], snapshot = cards) {
    const board = boardOf(boardId);
    const actions: DemoAction[] = [];
    const notes: string[] = [];
    const summaries: string[] = [];
    for (const value of texts) {
      const result = planDemoUpdate(value, snapshot[boardId], board.columns, locale);
      if (result.actions.length) {
        actions.push(...result.actions);
        summaries.push(result.summary);
      } else if (result.summary) notes.push(result.summary);
    }
    return { actions, notes, summary: summaries.join(" ") };
  }

  function previewOf(boardId: string, actions: DemoAction[], summary: string, inputText: string): Proposal {
    const board = boardOf(boardId);
    const columnTitle = (id: string | null) => board.columns.find(column => column.id === id)?.title ?? null;
    const preview: PreviewAction[] = actions.map((action, index) => {
      const current = cards[boardId].find(item => item.id === action.cardId);
      return {
        index,
        action: action.action,
        cardId: action.cardId,
        cardTitle: current?.title ?? null,
        newTitle: action.action === "create" ? action.title : null,
        fromColumn: current ? columnTitle(current.columnId) : null,
        toColumn: action.targetColumnId && action.targetColumnId !== current?.columnId ? columnTitle(action.targetColumnId) : null,
        changes: [
          ...(action.priority ? [{ field: "priority" as const, from: current?.priority ?? null, to: action.priority }] : []),
          ...(action.dueDate ? [{ field: "dueDate" as const, from: current?.dueDate ?? null, to: action.dueDate }] : []),
        ],
        reason: action.reason,
      };
    });
    return {
      id: `demo-${boardId}-${Date.now()}`,
      summary,
      clarification: null,
      status: "PENDING",
      expiresAt: "",
      inputText,
      source,
      actions: preview,
    };
  }

  function propose(routed: DemoSegment[]) {
    const grouped = new Map<string, string[]>();
    for (const segment of routed)
      if (segment.boardId) grouped.set(segment.boardId, [...(grouped.get(segment.boardId) || []), segment.text]);
    const created: Pending[] = [];
    const notes: string[] = [];
    for (const [boardId, texts] of grouped) {
      const result = plan(boardId, texts);
      notes.push(...result.notes);
      if (result.actions.length)
        created.push({
          id: `${boardId}-${Date.now()}`,
          boardId,
          texts,
          actions: result.actions,
          proposal: previewOf(boardId, result.actions, result.summary, texts.join("\n")),
        });
    }
    setPending(created);
    setSegments([]);
    setText("");
    setMessage(notes.join(" "));
  }

  function organize(value = text) {
    const input = value.trim();
    if (!input || busy) return;
    setMessage("");
    const routed = routeDemoText(
      input,
      initial.boards.map(board => ({ id: board.id, kind: board.kind, cards: cards[board.id] })),
    );
    if (routed.some(segment => !segment.boardId)) setSegments(routed);
    else propose(routed);
  }

  function moveTo(item: Pending, boardId: string) {
    const result = plan(boardId, item.texts);
    setPending(current =>
      current.flatMap(entry =>
        entry.id !== item.id
          ? [entry]
          : result.actions.length
            ? [
                {
                  ...entry,
                  boardId,
                  actions: result.actions,
                  proposal: previewOf(boardId, result.actions, result.summary, item.texts.join("\n")),
                },
              ]
            : [],
      ),
    );
    if (!result.actions.length) setMessage(result.notes.join(" "));
  }

  function apply(item: Pending, indexes: number[]) {
    setHistory(current => [...current, cards]);
    let next = [...cards[item.boardId]];
    const touched: string[] = [];
    item.actions.forEach((action, index) => {
      if (!indexes.includes(index)) return;
      if (action.action === "create") {
        const id = `n${Date.now()}${index}`;
        next = [
          card(id, action.title || "Card", action.targetColumnId || "inbox", {
            priority: action.priority || "NORMAL",
            dueDate: action.dueDate,
            tags: ["demo"],
          }),
          ...next,
        ];
        touched.push(id);
        return;
      }
      next = next.map(entry =>
        entry.id === action.cardId
          ? {
              ...entry,
              columnId: action.targetColumnId || entry.columnId,
              priority: action.priority || entry.priority,
              dueDate: action.dueDate || entry.dueDate,
            }
          : entry,
      );
      if (action.cardId) touched.push(action.cardId);
    });
    // Changed cards go on top of their column, like in the product.
    next.sort((a, b) => Number(touched.includes(b.id)) - Number(touched.includes(a.id)));
    setCards(current => ({ ...current, [item.boardId]: next }));
    setPending(current => current.filter(entry => entry.id !== item.id));
    setActiveBoard(item.boardId);
    setHighlighted(new Set(touched));
    timers.current.push(setTimeout(() => setHighlighted(new Set()), 6000));
    setMessage(t("demo.applied", { board: boardOf(item.boardId).name }));
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    setCards(initial.cards);
    setHistory([]);
    setPending([]);
    setSegments([]);
    setText("");
    setListening(0);
    setMessage("");
  }

  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const everywhere = initial.boards.flatMap(board =>
    cards[board.id]
      .filter(item => item.columnId !== "done")
      .map(item => ({ item, board, column: board.columns.find(column => column.id === item.columnId)?.title ?? "" })),
  );
  const today = everywhere
    .filter(({ item }) => item.dueDate && new Date(item.dueDate).getTime() < tomorrow.getTime())
    .sort((a, b) => new Date(a.item.dueDate!).getTime() - new Date(b.item.dueDate!).getTime());
  const active = everywhere.filter(({ item }) => item.columnId === "doing" && !item.dueDate);
  const columns: Column[] = boardOf(activeBoard).columns.map((column, position) => ({
    id: column.id,
    title: column.title,
    description: "",
    position,
    cards: cards[activeBoard].filter(item => item.columnId === column.id).map(toCard),
  }));
  const openCard = () => setMessage(t("demo.openCard"));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="home-dashboard">
        <div className="home-main">
          <div className="panel home-capture">
            <span className="eyebrow">{t("home.assistant.eyebrow")}</span>
            <div className="home-capture-main">
              <button
                type="button"
                className={`home-mic ${listening ? "active" : ""}`}
                onClick={speak}
                disabled={busy && !listening}
                aria-label={t("home.assistant.speak")}
              >
                <Icon name={listening ? "stop" : "mic"} size={44} />
              </button>
              <div className="home-capture-copy">
                <h2>{t("home.assistant.title")}</h2>
                <strong className="home-capture-status" aria-live="polite">
                  {listening ? t("home.assistant.recording", { seconds: listening }) : t("home.assistant.speak")}
                </strong>
                <span className="subtle">{t("home.assistant.body")}</span>
              </div>
            </div>
            <label htmlFor="demo-thoughts" className="field-label">
              {t("home.assistant.textLabel")}
            </label>
            <textarea
              id="demo-thoughts"
              rows={3}
              value={text}
              disabled={busy}
              placeholder={t("demo.placeholder")}
              onChange={event => {
                setText(event.target.value);
                setSource("text");
                setSegments([]);
              }}
              onKeyDown={event => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  organize();
                }
              }}
            />
            <div className="row home-capture-actions">
              <span className="subtle">{t("home.assistant.previewHint")}</span>
              <span className="spacer" />
              <button type="button" className="btn primary" disabled={!text.trim() || busy} onClick={() => organize()}>
                <Icon name="sparkles" size={16} />
                {t("home.assistant.organize")}
              </button>
            </div>
            <div className="demo-examples">
              <span className="subtle">{t("demo.examples")}</span>
              <div className="composer-examples">
                {initial.examples.map(example => (
                  <button
                    key={example}
                    type="button"
                    className="chip"
                    disabled={busy}
                    onClick={() => {
                      setText(example);
                      setSource("text");
                      organize(example);
                    }}
                  >
                    <Icon name="sparkles" size={13} />
                    {example}
                  </button>
                ))}
              </div>
            </div>
            <p className="subtle demo-local">
              <Icon name="info" size={13} /> {t("demo.local")}
            </p>
            {message && (
              <div className="notice info" role="status">
                <Icon name="sparkles" />
                <div className="notice-body">{message}</div>
                {history.length > 0 && !pending.length && (
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
            {segments.length > 0 && (
              <div className="home-routing">
                <h3>{t("home.assistant.routeTitle")}</h3>
                {segments.map((segment, index) => (
                  <div className="home-route-row" key={`${segment.text}-${index}`}>
                    <p>“{segment.text}”</p>
                    <select
                      aria-label={t("home.assistant.destination")}
                      value={segment.boardId || ""}
                      onChange={event =>
                        setSegments(current =>
                          current.map((item, i) => (i === index ? { ...item, boardId: event.target.value || null } : item)),
                        )
                      }
                    >
                      <option value="">{t("home.assistant.chooseBoard")}</option>
                      {initial.boards.map(board => (
                        <option value={board.id} key={board.id}>
                          {board.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <div className="row">
                  <button type="button" className="btn" onClick={() => setSegments([])}>
                    {t("common.cancel")}
                  </button>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn primary"
                    disabled={segments.some(segment => !segment.boardId)}
                    onClick={() => propose(segments)}
                  >
                    {t("home.assistant.preview")}
                  </button>
                </div>
              </div>
            )}
            {pending.map(item => (
              <div className="home-pending" key={item.id}>
                <div className="row">
                  <Icon name={boardOf(item.boardId).kind === "personal" ? "home" : "file"} size={15} />
                  <strong>{boardOf(item.boardId).name}</strong>
                  <span className="spacer" />
                  <select aria-label={t("home.assistant.changeBoard")} value="" onChange={event => moveTo(item, event.target.value)}>
                    <option value="">{t("home.assistant.changeBoard")}</option>
                    {initial.boards
                      .filter(board => board.id !== item.boardId)
                      .map(board => (
                        <option value={board.id} key={board.id}>
                          {board.name}
                        </option>
                      ))}
                  </select>
                </div>
                <ProposalPanel
                  proposal={item.proposal}
                  busy={false}
                  onApply={indexes => apply(item, indexes)}
                  onDiscard={() => setPending(current => current.filter(entry => entry.id !== item.id))}
                  onClarify={() => undefined}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="home-side">
          <div className="panel home-today">
            <span className="eyebrow">{t("home.today.eyebrow")}</span>
            <h2>{t("home.today.title")}</h2>
            <p className="subtle">{new Date().toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" })}</p>
            {today.length ? (
              <ul>
                {today.map(({ item, board, column }) => {
                  const overdue = new Date(item.dueDate!).getTime() < todayStart.getTime();
                  return (
                    <li key={`${board.id}-${item.id}`}>
                      <a
                        href={`#demo-boards`}
                        onClick={() => {
                          setActiveBoard(board.id);
                          setHighlighted(new Set([item.id]));
                        }}
                      >
                        <strong>{item.title}</strong>
                        <span>
                          {board.name} · {column}
                        </span>
                        <small className={overdue ? "overdue" : ""}>{overdue ? t("home.today.overdue") : t("home.today.dueToday")}</small>
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="home-today-empty">
                <Icon name="checkCircle" size={23} />
                <p>{t("home.today.empty")}</p>
              </div>
            )}
            {active.length > 0 && (
              <>
                <h3 className="home-today-sub">{t("home.today.activeTitle")}</h3>
                <ul>
                  {active.map(({ item, board, column }) => (
                    <li key={`${board.id}-${item.id}`}>
                      <a href={`#demo-boards`} onClick={() => setActiveBoard(board.id)}>
                        <strong>{item.title}</strong>
                        <span>
                          {board.name} · {column}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <section id="demo-boards" className="panel demo-boards" aria-labelledby="demo-boards-title">
        <div className="demo-boards-head">
          <div>
            <h2 id="demo-boards-title">{t("demo.boardsTitle")}</h2>
            <p className="subtle">{t("demo.boardsBody")}</p>
          </div>
          <span className="spacer" />
          <div className="segmented" role="tablist" aria-label={t("demo.boardsTitle")}>
            {initial.boards.map(board => (
              <button
                key={board.id}
                type="button"
                role="tab"
                aria-selected={activeBoard === board.id}
                onClick={() => setActiveBoard(board.id)}
              >
                <Icon name={board.kind === "personal" ? "home" : "file"} size={15} /> {board.name}
              </button>
            ))}
          </div>
          <div className="segmented" role="tablist" aria-label={t("board.views.label")}>
            {(["list", "kanban"] as const).map(value => (
              <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}>
                <Icon name={value} size={15} />
                <span className="hide-mobile"> {t(`board.views.${value}`)}</span>
              </button>
            ))}
          </div>
        </div>
        {view === "list" ? (
          <ListView columns={columns} onOpen={openCard} />
        ) : (
          <KanbanView
            columns={columns}
            highlighted={highlighted}
            canWrite
            archivedView={false}
            onOpen={openCard}
            onMove={(moved, columnId) => {
              setHistory(current => [...current, cards]);
              setCards(current => ({
                ...current,
                [activeBoard]: current[activeBoard].map(item => (item.id === moved.id ? { ...item, columnId } : item)),
              }));
            }}
            onArchive={openCard}
            onAdd={openCard}
          />
        )}
        <div className="row">
          <span className="subtle">{t("demo.resetHint")}</span>
          <button type="button" className="btn sm ghost" onClick={reset}>
            <Icon name="refresh" size={14} />
            {t("demo.reset")}
          </button>
        </div>
      </section>
    </div>
  );
}

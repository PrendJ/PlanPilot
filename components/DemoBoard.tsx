"use client";

import { useState } from "react";

type DemoCard = { title: string; desc: string; tags: string[] };
type DemoColumn = { title: string; cards: DemoCard[] };
type DemoLog = { input: string; result: string };

const initialDemo: DemoColumn[] = [
  { title: "Inbox", cards: [{ title: "Valutare dashboard query costi", desc: "Capire filtri e vista tipo Power BI semplice", tags: ["idea"] }] },
  { title: "Next", cards: [{ title: "Migrare flusso newsletter", desc: "Preparare test e limiti invio", tags: ["n8n"] }, { title: "Allineamento workspace AI", desc: "Coinvolgere amministratori e costi", tags: ["AI"] }] },
  { title: "In progress", cards: [{ title: "Migrazione Zapier → n8n", desc: "TLS 587 verificato, pronto per attivazione", tags: ["automation"] }] },
  { title: "Waiting", cards: [{ title: "Accesso Google Drive", desc: "Necessario per migrare i flussi successivi", tags: ["blocked"] }] },
  { title: "Done", cards: [{ title: "Primo test SMTP", desc: "Configurazione validata", tags: ["done"] }] },
  { title: "Parked", cards: [{ title: "Flussi community complessi", desc: "Da riprendere più avanti", tags: ["later"] }] },
];

const examples = [
  "Ho finito la migrazione newsletter",
  "Sto lavorando alla nuova dashboard economica",
  "Il test con Google Drive è bloccato in attesa degli accessi",
];

function cloneColumns(columns: DemoColumn[]) {
  return columns.map((column) => ({ ...column, cards: column.cards.map((card) => ({ ...card, tags: [...card.tags] })) }));
}

function targetColumn(text: string) {
  const value = text.toLowerCase();
  if (/finito|finita|concluso|conclusa|completato|completata|fatto|fatta|done/.test(value)) return "Done";
  if (/blocc|attesa|aspetto|waiting|dipend/.test(value)) return "Waiting";
  if (/lavorando|iniziato|iniziata|in corso|sto facendo|started/.test(value)) return "In progress";
  if (/prossim|next|da fare subito|priorit/.test(value)) return "Next";
  if (/parchegg|più avanti|non priorit|later/.test(value)) return "Parked";
  return "Inbox";
}

function titleFromUpdate(text: string) {
  return text
    .replace(/^(ho|sto|stiamo|abbiamo|il|la|un|una)\s+/i, "")
    .replace(/^(finito|finita|concluso|conclusa|completato|completata|iniziato|iniziata|lavorando a|lavorando alla|lavorando al)\s+/i, "")
    .trim()
    .replace(/[.!?]+$/, "")
    .slice(0, 90) || "Nuovo aggiornamento";
}

export function DemoBoard() {
  const [columns, setColumns] = useState<DemoColumn[]>(() => cloneColumns(initialDemo));
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [logs, setLogs] = useState<DemoLog[]>([]);

  function applyUpdate() {
    const input = text.trim();
    if (!input) return;
    const target = targetColumn(input);
    const title = titleFromUpdate(input);
    const card: DemoCard = {
      title,
      desc: "Aggiornamento simulato dalla demo pubblica di VoxBoard AI.",
      tags: ["demo"],
    };

    setColumns((current) => current.map((column) => column.title === target ? { ...column, cards: [card, ...column.cards] } : column));
    setLogs((current) => [{ input, result: `Creato in ${target}` }, ...current].slice(0, 4));
    setStatus(`Demo: VoxBoard AI ha interpretato l’aggiornamento e creato una card in “${target}”.`);
    setText("");
  }

  function reset() {
    setColumns(cloneColumns(initialDemo));
    setLogs([]);
    setStatus("Demo ripristinata.");
    setText("");
  }

  return <>
    <div className="composer-wrap demo-composer-wrap">
      <div className="composer">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Prova: “Ho finito la migrazione newsletter” oppure “Sto lavorando alla dashboard economica”…"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") applyUpdate();
          }}
        />
        <div className="composer-tools">
          <button className="send-btn" disabled={!text.trim()} onClick={applyUpdate} title="Simula aggiornamento">↗</button>
        </div>
      </div>
      <div className="composer-note">Demo locale · nessun login · nessuna chiamata AI · ⌘/Ctrl + Enter per provare</div>
      <div className="demo-examples">
        {examples.map((example) => <button className="btn ghost" type="button" key={example} onClick={() => setText(example)}>{example}</button>)}
        <button className="btn" type="button" onClick={reset}>Reset demo</button>
      </div>
    </div>

    {status && <div className="status demo-status">{status}</div>}

    <div className="board-wrap"><div className="board">{columns.map((col) => <div className="column" key={col.title}><div className="column-head"><span>{col.title}</span><span className="count">{col.cards.length}</span></div>{col.cards.map((card, index) => <div className="card" key={`${col.title}-${card.title}-${index}`}><div className="card-title">{card.title}</div><div className="card-desc">{card.desc}</div><div className="card-meta">{card.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div>)}</div>)}</div></div>

    {logs.length > 0 && <div className="history"><h3>Demo activity</h3>{logs.map((log, index) => <div className="log" key={`${log.input}-${index}`}><div className="log-main"><div className="log-input">{log.input}</div><div className="log-summary">{log.result}</div></div><div className="log-cost">$0 demo</div></div>)}</div>}
  </>;
}

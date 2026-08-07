const demo = [
  { title: "Inbox", cards: [{title:"Valutare dashboard query costi",desc:"Capire filtri e vista tipo Power BI semplice",tags:["idea"]}] },
  { title: "Next", cards: [{title:"Migrare flusso newsletter",desc:"Preparare test e limiti invio",tags:["n8n"]},{title:"Allineamento workspace AI",desc:"Coinvolgere amministratori e costi",tags:["AI"]}] },
  { title: "In progress", cards: [{title:"Migrazione Zapier → n8n",desc:"TLS 587 verificato, pronto per attivazione",tags:["automation"]}] },
  { title: "Waiting", cards: [{title:"Accesso Google Drive",desc:"Necessario per migrare i flussi successivi",tags:["blocked"]}] },
  { title: "Done", cards: [{title:"Primo test SMTP",desc:"Configurazione validata",tags:["done"]}] },
  { title: "Parked", cards: [{title:"Flussi community complessi",desc:"Da riprendere più avanti",tags:["later"]}] },
];

export function DemoBoard() {
  return <div className="board-wrap"><div className="board">{demo.map((col) => <div className="column" key={col.title}><div className="column-head"><span>{col.title}</span><span className="count">{col.cards.length}</span></div>{col.cards.map((card)=><div className="card" key={card.title}><div className="card-title">{card.title}</div><div className="card-desc">{card.desc}</div><div className="card-meta">{card.tags.map(t=><span className="tag" key={t}>{t}</span>)}</div></div>)}</div>)}</div></div>;
}

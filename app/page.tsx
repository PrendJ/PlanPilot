import { getCurrentUser } from "@/lib/auth";
import { Topbar } from "@/components/Topbar";
import { PublicFooter } from "@/components/PublicFooter";

const loop = [
  { step: "01", title: "Parla o scrivi", copy: "Racconta cosa hai finito, cosa stai facendo, cosa è bloccato e cosa viene dopo. Come lo diresti a un collega." },
  { step: "02", title: "L’AI capisce il cambiamento", copy: "BoardCue AI legge il piano corrente e traduce il tuo aggiornamento in una patch minima e strutturata." },
  { step: "03", title: "La board si aggiorna", copy: "Task, stato, priorità, scadenze e tag vengono aggiornati senza dover ricostruire manualmente il contesto." },
  { step: "04", title: "Il loop continua", copy: "Ogni nuovo update parte dallo stato reale della board. Il piano resta vivo, leggibile e condiviso." },
];

const features = [
  ["🎙", "Voice-first", "Detta gli aggiornamenti dal browser. La trascrizione può essere attivata o disattivata per ogni workspace."],
  ["✦", "AI-native", "Il modello non riscrive il progetto: propone mutazioni strutturate e limitate sulla board esistente."],
  ["▦", "Board su misura", "Cinque preset, colonne condivise personalizzabili e card complete, dal desktop allo smartphone."],
  ["↺", "Audit e annullamento", "Ogni aggiornamento AI è visibile, attribuito, registrato e annullabile senza esporre costi o provider."],
  ["◎", "Organizzazioni", "Separa clienti e progetti con più workspace, membership esplicite e ruoli granulari."],
  ["⚙", "Privacy AI", "Endpoint ZDR, raccolta dati negata e nessun fallback verso provider con garanzie inferiori."],
];

export default async function Home() {
  const user = await getCurrentUser();
  const accountHref = user ? "/app" : "/login";
  const accountLabel = user ? "Apri i workspace" : "Accedi";

  return (
    <div className="shell marketing-shell">
      <Topbar loggedIn={Boolean(user)} />
      <main className="marketing-main">
        <section className="marketing-hero">
          <div className="marketing-hero-copy">
            <div className="pill">VOICE + AI + KANBAN</div>
            <h1>La board che ascolta il tuo lavoro.</h1>
            <p className="marketing-lead">
              BoardCue AI è un workspace di project management in stile Trello, pensato però
              per essere aggiornato parlando. Tu racconti cosa è cambiato, l’AI interpreta
              l’update e mantiene la board sincronizzata.
            </p>
            <div className="marketing-actions">
              <a className="btn accent marketing-cta" href="/demo">Prova la demo</a>
              <a className="btn marketing-cta" href={accountHref}>{accountLabel}</a>
            </div>
            <div className="marketing-fineprint">Demo senza login · nessuna chiamata AI · prova reale di 7 giorni senza carta</div>
          </div>

          <div className="voice-loop-card" aria-label="Esempio di aggiornamento BoardCue AI">
            <div className="voice-loop-top"><span className="voice-dot">●</span><span>Voice update</span><span className="voice-live">AI</span></div>
            <div className="waveform" aria-hidden="true">
              {[12, 28, 18, 42, 22, 54, 32, 46, 18, 38, 26, 50, 20, 34, 14].map((height, index) => <i key={index} style={{ height }} />)}
            </div>
            <blockquote>“Ho chiuso il test SMTP. La migrazione newsletter è ora in corso, ma Google Drive resta bloccato finché non arrivano gli accessi.”</blockquote>
            <div className="loop-result"><span>Test SMTP → <strong>Done</strong></span><span>Newsletter → <strong>In progress</strong></span><span>Google Drive → <strong>Waiting</strong></span></div>
            <div className="loop-badge">Talk → Understand → Update → Repeat</div>
          </div>
        </section>

        <section className="marketing-section">
          <div className="section-heading"><div className="pill">IL LOOP</div><h2>Da aggiornamento umano a board strutturata.</h2><p>Non devi ricordarti dove spostare ogni card: mantieni il focus sul lavoro, BoardCue mantiene il piano.</p></div>
          <div className="loop-grid">{loop.map((item) => <article className="loop-step" key={item.step}><span>{item.step}</span><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div>
        </section>

        <section className="marketing-section split-section">
          <div className="section-heading compact-heading">
            <div className="pill">NON SOLO UN ALTRO TRELLO</div>
            <h2>La board è l’interfaccia. Il linguaggio è il comando.</h2>
            <p>Puoi continuare a usare drag & drop e leggere il progetto come una Kanban classica. La differenza è che per mantenerla aggiornata puoi semplicemente raccontare ciò che è successo.</p>
            <a className="text-link" href="/demo">Prova il comportamento nella demo →</a>
          </div>
          <div className="mini-board" aria-hidden="true">{["Next", "In progress", "Waiting", "Done"].map((name, index) => <div className="mini-column" key={name}><div>{name}<span>{index + 1}</span></div><i />{index === 1 && <i />}</div>)}</div>
        </section>

        <section className="marketing-section">
          <div className="section-heading"><div className="pill">BUILT FOR THE LOOP</div><h2>Tutto ciò che serve per usarlo come strumento di lavoro.</h2></div>
          <div className="feature-grid">{features.map(([icon, title, copy]) => <article className="feature-card" key={title}><span className="feature-icon">{icon}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
        </section>

        <section className="marketing-section privacy-callout">
          <div><div className="pill">PRIVACY BY CLARITY</div><h2>Sai quando entra in gioco l’AI.</h2></div>
          <div><p>La demo è locale e non invia nulla a modelli AI. Nei workspace autenticati, testo e contesto minimo della board vengono inviati a OpenRouter solo quando usi una funzione AI; l’audio viene inviato soltanto quando avvii la dettatura.</p><div className="inline-links"><a href="/privacy">Privacy Policy</a><a href="/cookies">Cookie Policy</a></div></div>
        </section>

        <section className="final-cta">
          <div className="pill">TALK. UPDATE. REPEAT.</div><h2>Prova il loop prima di entrare nel workspace.</h2><p>La demo simula l’esperienza principale nel browser. Se hai già un account, entra direttamente nelle tue board.</p>
          <div className="marketing-actions centered"><a className="btn accent marketing-cta" href="/register">Prova gratis</a><a className="btn marketing-cta" href="/pricing">Vedi i prezzi</a><a className="btn marketing-cta" href={accountHref}>{accountLabel}</a></div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

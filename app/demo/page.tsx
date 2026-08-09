import { Topbar } from "@/components/Topbar";
import { DemoBoard } from "@/components/DemoBoard";
import { PublicFooter } from "@/components/PublicFooter";

export default function DemoPage() {
  return (
    <div className="shell">
      <Topbar />
      <main className="page hero-demo">
        <div className="hero-row">
          <div className="hero-copy">
            <div className="pill">PUBLIC DEMO</div>
            <h1>BoardCue AI in azione, senza login.</h1>
            <p>Prova il loop principale: racconta cosa è cambiato e guarda la board aggiornarsi in locale. Nessun dato reale viene caricato e nessuna chiamata AI viene eseguita dalla demo.</p>
          </div>
          <div className="top-actions">
            <a className="btn" href="https://boardcue.draftapps.it/">Home</a>
            <a className="btn accent" href="/login">Accedi</a>
          </div>
        </div>
        <div className="demo-banner"><span>Demo pubblica · interattiva · nessuna autenticazione richiesta</span></div>
        <DemoBoard />
      </main>
      <PublicFooter />
    </div>
  );
}

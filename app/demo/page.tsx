import { Topbar } from "@/components/Topbar";
import { DemoBoard } from "@/components/DemoBoard";

export default function DemoPage() {
  return (
    <div className="shell">
      <Topbar />
      <main className="page hero-demo">
        <div className="hero-row">
          <div className="hero-copy">
            <div className="pill">PUBLIC DEMO</div>
            <h1>PlanPilot in azione, senza login.</h1>
            <p>
              Questa board mostra l’esperienza di PlanPilot con dati dimostrativi e in sola lettura.
              Nessun dato reale viene caricato e nessuna chiamata AI viene eseguita dalla demo.
            </p>
          </div>
          <div className="top-actions">
            <a className="btn" href="/">Panoramica</a>
            <a className="btn accent" href="/login">Accedi</a>
          </div>
        </div>
        <div className="demo-banner">
          <span>Demo pubblica · sola lettura · nessuna autenticazione richiesta</span>
        </div>
        <DemoBoard />
      </main>
    </div>
  );
}

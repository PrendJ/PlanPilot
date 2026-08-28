import { Topbar } from "@/components/Topbar";
import { DemoBoard } from "@/components/DemoBoard";
import { PublicFooter } from "@/components/PublicFooter";
import { PAID_PLAN_KEYS, PLANS, quotaIncreaseFromSolo } from "@/lib/plans";

const serviceBenefits = [
  {
    number: "01",
    title: "Aggiornamenti naturali",
    copy: "Parla o scrivi come faresti con un collega: BoardCue AI trasforma l'aggiornamento in azioni chiare sulla board.",
  },
  {
    number: "02",
    title: "Piani sempre leggibili",
    copy: "Attività, priorità, blocchi e prossimi passi restano nel posto giusto, così il team parte sempre dallo stato reale del lavoro.",
  },
  {
    number: "03",
    title: "Lavoro condiviso e tracciabile",
    copy: "Organizza clienti e progetti in workspace, coinvolgi il team e tieni uno storico degli aggiornamenti AI, annullabile quando serve.",
  },
];

const demoPlanDetails = {
  SOLO: { audience: "Per chi gestisce in autonomia", details: ["1 membro", "6 workspace"], featured: false },
  TEAM: { audience: "Per i team che lavorano insieme", details: ["Fino a 10 membri", "10 workspace"], featured: true },
  STUDIO: { audience: "Per studi e team in crescita", details: ["Fino a 24 membri", "Workspace illimitati"], featured: false },
};

export default function DemoPage() {
  return (
    <div className="shell">
      <Topbar />
      <main className="page hero-demo">
        <div className="hero-row">
          <div className="hero-copy">
            <div className="pill">PUBLIC DEMO</div>
            <h1>Trasforma gli aggiornamenti in un piano che il team può seguire.</h1>
            <p>BoardCue AI è un workspace di project management che ascolta il lavoro: racconti cosa è cambiato e la board mantiene attività, priorità e blocchi allineati.</p>
          </div>
          <div className="top-actions">
            <a className="btn" href="https://boardcue.draftapps.it/">Home</a>
            <a className="btn accent" href="/register">Prova gratis</a>
          </div>
        </div>
        <div className="demo-banner"><span>Prova il gesto principale: aggiorna la board con parole tue, poi trascina le card per esplorare il flusso.</span></div>
        <DemoBoard />

        <section className="demo-service-section" aria-labelledby="service-heading">
          <div className="section-heading">
            <div className="pill">IL SERVIZIO</div>
            <h2 id="service-heading">Meno manutenzione della board. Più chiarezza sul lavoro.</h2>
            <p>La demo mostra il meccanismo. Nei workspace BoardCue AI lo applica ai tuoi progetti, con il contesto della board, le persone e i controlli necessari per lavorare ogni giorno.</p>
          </div>
          <div className="demo-benefit-grid">
            {serviceBenefits.map((benefit) => (
              <article className="demo-benefit" key={benefit.number}>
                <span>{benefit.number}</span>
                <h3>{benefit.title}</h3>
                <p>{benefit.copy}</p>
              </article>
            ))}
          </div>
          <div className="demo-service-note">
            <strong>Dal singolo progetto al team.</strong>
            <span>Personalizza colonne e card, usa drag & drop quando preferisci e lascia che l&apos;AI aggiorni solo quando la chiami. Ogni intervento resta visibile e reversibile.</span>
          </div>
        </section>

        <section className="demo-pricing-section" aria-labelledby="demo-pricing-heading">
          <div className="section-heading">
            <div className="pill">PREZZI</div>
            <h2 id="demo-pricing-heading">Scegli il ritmo giusto. Parti gratis.</h2>
            <p>Prova BoardCue AI per 7 giorni senza carta. Poi scegli il piano che accompagna il tuo modo di lavorare.</p>
          </div>
          <div className="demo-pricing-grid">
            {PAID_PLAN_KEYS.map((key) => {
              const plan = PLANS[key];
              const details = demoPlanDetails[key];
              const increase = quotaIncreaseFromSolo(key);
              return <article className={`demo-plan ${details.featured ? "featured" : ""}`} key={key}>
                {details.featured && <span className="demo-plan-label">PIÙ SCELTO</span>}
                <h3>{plan.label}</h3>
                <p>{details.audience}</p>
                <strong>€{plan.priceEur}<small> + IVA / mese</small></strong>
                <ul>{[...details.details, increase === null ? "Quota voce e AI inclusa" : `Quota voce e AI: +${increase}% rispetto a Solo`].map((detail) => <li key={detail}>{detail}</li>)}</ul>
                <a className={`btn ${details.featured ? "accent" : ""}`} href="/register">Inizia la prova gratuita</a>
              </article>
            })}
          </div>
          <div className="demo-pricing-footer">
            <span>Hai un team più grande o esigenze specifiche?</span>
            <a className="text-link" href="/pricing">Scopri Enterprise e tutti i dettagli →</a>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

import type { Metadata } from "next";
import { Topbar } from "@/components/Topbar";
import { PublicFooter } from "@/components/PublicFooter";

export const metadata: Metadata = { title: "Subprocessori" };

const rows = [
  [
    "Hosting e database",
    process.env.HOSTING_PROVIDER || "Da indicare (server del titolare gestito con Coolify)",
    process.env.HOSTING_LOCATION || "UE",
    "Erogazione del servizio, database PostgreSQL, backup",
    "Tutti i dati del servizio",
  ],
  [
    "OpenRouter, Inc.",
    "Stati Uniti",
    "UE / USA (in transito, zero data retention)",
    "Instradamento delle richieste AI verso i provider di modelli",
    "Testo dell’aggiornamento, contesto ridotto della board, audio (non conservato)",
  ],
  [
    "Provider di modelli scelti da OpenRouter: Google Cloud (Vertex AI), Microsoft Azure, Mistral AI",
    "Stati Uniti / Francia",
    "UE / USA (solo endpoint con zero data retention)",
    "Interpretazione degli aggiornamenti e trascrizione della dettatura",
    "Come sopra, senza conservazione",
  ],
  [
    "Stripe Payments Europe, Ltd.",
    "Dublino, Irlanda",
    "UE / USA (DPF)",
    "Pagamenti, abbonamenti, imposte, fatture",
    "Dati di fatturazione e di pagamento",
  ],
  [
    process.env.SMTP_PROVIDER_NAME || "Provider email transazionali",
    process.env.SMTP_PROVIDER_LOCATION || "Da indicare",
    "—",
    "Email di verifica, inviti, promemoria, riepiloghi",
    "Nome, email, contenuto del messaggio",
  ],
] as const;

export default function Subprocessors() {
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="legal-page" style={{ width: "min(960px, 100% - 32px)" }}>
        <span className="eyebrow">Subprocessori</span>
        <h1>Fornitori che trattano dati per BoardCue</h1>
        <p className="legal-updated">Aggiornato al 23 settembre 2026 · completare ragioni sociali mancanti prima del lancio</p>
        <div className="table-wrap" style={{ marginTop: 24 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Fornitore</th>
                <th>Sede</th>
                <th>Luogo del trattamento</th>
                <th>Finalità</th>
                <th>Dati</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row[0]}>
                  {row.map(cell => (
                    <td key={cell}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section>
          <h2>Modifiche</h2>
          <p>
            Comunicheremo ai clienti l’aggiunta o la sostituzione di un subprocessore con almeno 30 giorni di anticipo tramite email agli
            owner dei team.
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

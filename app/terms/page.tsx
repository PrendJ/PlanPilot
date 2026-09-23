import type { Metadata } from "next";
import { Topbar } from "@/components/Topbar";
import { PublicFooter } from "@/components/PublicFooter";
import { CREDIT_PACK, PLANS, TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = { title: "Termini di servizio" };

export default function Terms() {
  const provider = process.env.LEGAL_ENTITY_NAME || "Lorenzo Prandi – Draftapps";
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="legal-page">
        <span className="eyebrow">Termini di servizio</span>
        <h1>Condizioni di BoardCue</h1>
        <p className="legal-updated">
          Bozza operativa · 23 settembre 2026 · da sottoporre a revisione legale professionale prima del lancio
        </p>
        <section>
          <h2>1. Fornitore e servizio</h2>
          <p>
            BoardCue è un servizio di gestione del lavoro assistito da AI fornito da <strong>{provider}</strong>
            {process.env.LEGAL_VAT_NUMBER ? ` (P.IVA ${process.env.LEGAL_VAT_NUMBER})` : ""}. Il cliente è responsabile degli utenti che
            invita, della liceità dei contenuti e della correttezza dei dati inseriti.
          </p>
        </section>
        <section>
          <h2>2. Prova e piani</h2>
          <p>
            La prova dura {TRIAL_DAYS} giorni, non richiede carta e include le funzioni del piano Pro per una persona, con{" "}
            {PLANS.TRIAL.aiUpdates} aggiornamenti AI. La dettatura vocale è inclusa in tutti i piani.
          </p>
          <p>
            Piani mensili o annuali, fatturati in anticipo, IVA esclusa: Pro €{PLANS.PRO.priceEur}/mese; Team €{PLANS.TEAM.priceEur} per
            posto/mese (minimo {PLANS.TEAM.minSeats} posti); Business €{PLANS.BUSINESS.priceEur} per posto/mese (minimo{" "}
            {PLANS.BUSINESS.minSeats} posti). Gli ospiti (sola lettura e commenti) non occupano posti. Gli aggiornamenti AI inclusi si
            rinnovano ogni mese e non si accumulano; i pacchetti aggiuntivi ({CREDIT_PACK.units} aggiornamenti a €{CREDIT_PACK.priceEur})
            non scadono.
          </p>
          <p>
            Un “aggiornamento AI” è una richiesta di interpretazione di un testo o di una dettatura, anche se la proposta non viene poi
            applicata.
          </p>
        </section>
        <section>
          <h2>3. Fine della prova, disdetta e mancato pagamento</h2>
          <p>
            Alla fine della prova o dell’abbonamento il team viene <strong>congelato</strong>: le board restano consultabili ed esportabili
            in sola lettura e non vengono cancellate per mancato pagamento. Riattivando un piano si riprende da dove si era rimasti. La
            disdetta si effettua dal portale di fatturazione e ha effetto alla fine del periodo pagato.
          </p>
        </section>
        <section>
          <h2>4. Uso dell’AI</h2>
          <p>
            L’AI propone modifiche che vengono mostrate in anteprima e applicate solo su conferma (salvo che l’utente attivi l’applicazione
            automatica). Ogni modifica è registrata e annullabile. L’AI non deve essere usata per valutare lavoratori o prendere decisioni
            che li riguardano. Il cliente verifica gli output prima di farvi affidamento.
          </p>
        </section>
        <section>
          <h2>5. Sicurezza</h2>
          <p>
            Tutti i piani possono attivare la verifica in due passaggi con app di autenticazione; i piani Business possono renderla
            obbligatoria per il team. Il cliente custodisce credenziali, codici di recupero e token API.
          </p>
        </section>
        <section>
          <h2>6. Eliminazione dei dati</h2>
          <p>
            Il cliente può eliminare un team o il proprio account in ogni momento dalle impostazioni. L’accesso viene bloccato subito; dopo
            30 giorni i contenuti operativi vengono eliminati, salvo i registri che la legge impone di conservare.
          </p>
        </section>
        <section>
          <h2>7. Disponibilità e responsabilità</h2>
          <p>
            Il servizio è fornito con ragionevole diligenza, senza livelli di servizio garantiti. Salvo limiti inderogabili di legge, la
            responsabilità complessiva è limitata ai corrispettivi pagati nei dodici mesi precedenti.
          </p>
        </section>
        <section>
          <h2>8. Consumatori, legge e foro</h2>
          <p>
            I consumatori mantengono i diritti inderogabili previsti dal Codice del Consumo. Legge applicabile: italiana. Foro competente:
            da definire nella versione approvata professionalmente.
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

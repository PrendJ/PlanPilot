import type { Metadata } from "next";
import { Topbar } from "@/components/Topbar";
import { PublicFooter } from "@/components/PublicFooter";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const controller = process.env.LEGAL_ENTITY_NAME || "Lorenzo Prandi – Draftapps";
  const contact = process.env.PRIVACY_EMAIL || process.env.CONTACT_EMAIL;
  const contactLink = contact ? (
    <a href={`mailto:${contact}`}>{contact}</a>
  ) : (
    <a href="https://draftapps.it/#contatti" target="_blank" rel="noreferrer">
      sezione contatti di Draftapps
    </a>
  );
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="legal-page">
        <span className="eyebrow">Privacy Policy</span>
        <h1>Privacy Policy di BoardCue</h1>
        <p className="legal-updated">
          Ultimo aggiornamento: 23 settembre 2026 · bozza operativa da sottoporre a revisione legale professionale prima del lancio
          commerciale
        </p>
        <section>
          <h2>1. Titolare del trattamento</h2>
          <p>
            Il titolare è <strong>{controller}</strong>
            {process.env.LEGAL_VAT_NUMBER ? <> (P.IVA {process.env.LEGAL_VAT_NUMBER})</> : null}. Per richieste sulla privacy o per
            esercitare i diritti previsti dal GDPR scrivi a: {contactLink}.
          </p>
          <p>
            Per i dati che i clienti inseriscono nelle proprie board (ad esempio attività e nomi di colleghi o clienti), il cliente agisce
            di norma come titolare e BoardCue come responsabile del trattamento secondo le condizioni del servizio.
          </p>
        </section>
        <section>
          <h2>2. Quali dati trattiamo</h2>
          <h3>Sito pubblico e demo</h3>
          <p>
            La home e la demo non richiedono un account. La demo funziona interamente nel browser: nulla viene inviato a modelli AI.
            L’infrastruttura può generare log tecnici di rete e sicurezza.
          </p>
          <h3>Account e sicurezza</h3>
          <p>
            Nome, email, hash della password, lingua, preferenze, ruoli, appartenenza a team e board, dati di sessione. Se attivi la
            verifica in due passaggi conserviamo il segreto TOTP cifrato (AES-256-GCM) e l’impronta (hash) dei codici di recupero, mai i
            codici in chiaro.
          </p>
          <h3>Board</h3>
          <p>
            Colonne, card (titolo, descrizione, priorità, scadenze, tag, checklist), assegnatari, commenti e menzioni, notifiche, cronologia
            delle modifiche.
          </p>
          <h3>Aggiornamenti AI</h3>
          <p>
            Testo dell’aggiornamento, proposta generata (azioni e riepilogo), azioni applicate, modello usato, costo tecnico, autore e data.
            Le proposte non applicate scadono dopo 15 minuti e vengono cancellate entro 30 giorni.
          </p>
          <h3>Voce</h3>
          <p>
            Con la dettatura l’audio viene inviato al servizio di trascrizione e subito scartato: BoardCue non salva file audio. Il testo
            trascritto torna nel browser, modificabile prima dell’invio.
          </p>
          <h3>Fatturazione</h3>
          <p>
            Per i piani a pagamento Stripe tratta i dati di pagamento; noi riceviamo e conserviamo ragione sociale, indirizzo di
            fatturazione, P.IVA, codice fiscale, codice SDI e PEC necessari alla fattura elettronica, oltre allo stato dell’abbonamento.
          </p>
          <h3>Statistiche di prodotto</h3>
          <p>
            Contiamo solo eventi aggregati per giorno (es. “aggiornamenti AI applicati”), senza collegarli a persone, organizzazioni,
            indirizzi IP o contenuti, e registriamo sull’organizzazione le date dei primi passi di attivazione (prima board, primo
            aggiornamento AI, primo invito).
          </p>
        </section>
        <section>
          <h2>3. Finalità e basi giuridiche</h2>
          <ul>
            <li>
              <strong>Erogazione del servizio</strong> (account, board, AI, dettatura, notifiche, export): esecuzione del contratto, art.
              6(1)(b) GDPR.
            </li>
            <li>
              <strong>Sicurezza</strong> (autenticazione, 2FA, limiti di frequenza, prevenzione abusi): legittimo interesse, art. 6(1)(f).
            </li>
            <li>
              <strong>Fatturazione e obblighi fiscali</strong>: obbligo di legge, art. 6(1)(c).
            </li>
            <li>
              <strong>Email di servizio</strong> (verifica, inviti, promemoria della prova, riepilogo giornaliero disattivabile): esecuzione
              del contratto e legittimo interesse.
            </li>
          </ul>
        </section>
        <section>
          <h2>4. Intelligenza artificiale: provider senza conservazione</h2>
          <p>
            Per le funzioni AI il server invia il testo dell’aggiornamento e un contesto ridotto della board (solo card attive e pertinenti,
            descrizioni troncate). Le richieste passano da <strong>OpenRouter</strong> (instradamento), che le inoltra solo a endpoint di
            provider di modelli (ad esempio Google Cloud, Microsoft Azure o Mistral AI) classificati “Zero Data Retention”: il provider non
            conserva né usa i dati per addestrare modelli.
          </p>
          <p>
            Ogni richiesta impone zero data retention e raccolta dati negata. Se un endpoint non risponde, OpenRouter può passare solo a un
            altro endpoint con gli stessi requisiti; se nessuno è disponibile la richiesta fallisce.
          </p>
          <p>
            OpenRouter e alcuni provider di modelli hanno sede negli Stati Uniti e le richieste possono essere elaborate fuori dallo SEE, in
            transito e senza conservazione. Il trasferimento è regolato dalle clausole contrattuali standard o dal Data Privacy Framework,
            ove applicabili.
          </p>
          <p>
            Riferimenti:{" "}
            <a href="https://openrouter.ai/privacy/" target="_blank" rel="noreferrer">
              Privacy OpenRouter
            </a>{" "}
            ·{" "}
            <a href="https://openrouter.ai/docs/guides/features/zdr" target="_blank" rel="noreferrer">
              Zero Data Retention
            </a>{" "}
            .
          </p>
        </section>
        <section>
          <h2>5. Destinatari e trasferimenti</h2>
          <p>
            Trattano dati per nostro conto i fornitori elencati nella pagina <a href="/subprocessors">Subprocessori</a>. Eventuali
            trasferimenti extra-SEE avvengono sulla base di decisioni di adeguatezza (es. EU-US Data Privacy Framework) o clausole
            contrattuali standard.
          </p>
        </section>
        <section>
          <h2>6. Tempi di conservazione</h2>
          <ul>
            <li>
              <strong>Sessioni:</strong> fino a 30 giorni o fino al logout.
            </li>
            <li>
              <strong>Account non confermati:</strong> eliminati dopo 7 giorni se l’email non viene verificata.
            </li>
            <li>
              <strong>Prova gratuita ({TRIAL_DAYS} giorni) e abbonamenti scaduti:</strong> le board vengono <em>congelate</em> in sola
              lettura e restano consultabili ed esportabili; non le cancelliamo per mancato pagamento.
            </li>
            <li>
              <strong>Eliminazione richiesta</strong> (di un account o di un team): accesso bloccato subito; dopo 30 giorni i contenuti
              vengono eliminati e l’account anonimizzato.
            </li>
            <li>
              <strong>Registri contabili e di audit essenziali:</strong> fino a 10 anni quando richiesto dalla legge; periodo da confermare
              con consulenza fiscale.
            </li>
            <li>
              <strong>Notifiche lette:</strong> 90 giorni. <strong>Audio:</strong> mai conservato.
            </li>
          </ul>
          <p>Puoi esportare i dati in qualsiasi momento (CSV, JSON, Markdown) ed eliminare l’account dalle impostazioni.</p>
        </section>
        <section>
          <h2>7. Cookie e archiviazione locale</h2>
          <p>
            Solo strumenti tecnici o di preferenza, nessun cookie pubblicitario o di profilazione. Dettagli nella{" "}
            <a href="/cookies">Cookie Policy</a>.
          </p>
        </section>
        <section>
          <h2>8. Dati particolari</h2>
          <p>
            BoardCue non è progettato per categorie particolari di dati (art. 9 GDPR) né per valutare le persone: non inserirli senza una
            base giuridica e misure adeguate.
          </p>
        </section>
        <section>
          <h2>9. Diritti</h2>
          <p>
            Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opposizione, e proporre reclamo al Garante per la
            protezione dei dati personali. Scrivi a: {contactLink}.
          </p>
        </section>
        <section>
          <h2>10. Modifiche</h2>
          <p>Aggiorneremo questa informativa quando cambiano funzioni, fornitori o trattamenti, indicando la data in alto.</p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

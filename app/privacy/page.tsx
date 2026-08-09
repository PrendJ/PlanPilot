import { Topbar } from "@/components/Topbar";
import { PublicFooter } from "@/components/PublicFooter";

export default function PrivacyPage() {
  return (
    <div className="shell">
      <Topbar />
      <main className="legal-page">
        <div className="pill">PRIVACY POLICY</div>
        <h1>Privacy Policy di VoxBoard AI</h1>
        <p className="legal-updated">Ultimo aggiornamento: 9 agosto 2026</p>

        <section>
          <h2>1. Titolare del trattamento</h2>
          <p>
            Il titolare del trattamento è <strong>Lorenzo Prandi – Draftapps</strong>.
            Per richieste relative alla privacy o per esercitare i diritti previsti dal GDPR
            puoi scrivere a <a href="mailto:lorenzoprandi.lav@gmail.com">lorenzoprandi.lav@gmail.com</a>.
          </p>
          <p>VoxBoard AI è un progetto Draftapps accessibile su <strong>voxboard.draftapps.it</strong>.</p>
        </section>

        <section>
          <h2>2. Quali dati trattiamo</h2>
          <h3>Sito pubblico e demo</h3>
          <p>La home e la demo pubblica non richiedono un account. Le interazioni della demo vengono simulate nel browser e non vengono inviate a modelli AI. Possono comunque essere generati log tecnici di rete e sicurezza dall’infrastruttura che ospita il servizio.</p>
          <h3>Account e autenticazione</h3>
          <p>Per gli utenti abilitati trattiamo nome, indirizzo email, hash della password, ruoli, permessi, membership ai workspace, data di creazione e dati di sessione. Le password non vengono memorizzate in chiaro.</p>
          <h3>Workspace e board</h3>
          <p>Nei workspace vengono conservati i contenuti necessari al funzionamento della board: nomi dei workspace, colonne, titoli e descrizioni dei task, priorità, scadenze, tag, stato di archiviazione e dati relativi alle membership.</p>
          <h3>Aggiornamenti AI e audit log</h3>
          <p>Quando invii un aggiornamento, VoxBoard AI può memorizzare testo dell’input, sorgente dell’aggiornamento (testo o voce), sintesi, azioni applicate, modello usato, costo restituito dal provider quando disponibile, utente e data/ora. Queste informazioni servono a mantenere una cronologia verificabile delle modifiche.</p>
          <h3>Voce</h3>
          <p>Se la dettatura è attiva, l’audio registrato dal browser viene inviato al servizio di trascrizione tramite OpenRouter. VoxBoard AI non salva il file audio nel proprio database: usa il file per ottenere la trascrizione e restituisce il testo al browser. Se poi invii quel testo come aggiornamento, la trascrizione può entrare nell’audit log come normale input testuale.</p>
        </section>

        <section>
          <h2>3. Finalità e basi giuridiche</h2>
          <div className="legal-grid">
            <div className="legal-card"><h3>Erogazione del servizio</h3><p>Gestire account, workspace, board, esportazioni, dettatura e aggiornamenti AI. Base giuridica: esecuzione del servizio richiesto e, ove applicabile, misure precontrattuali o contrattuali ai sensi dell’art. 6(1)(b) GDPR.</p></div>
            <div className="legal-card"><h3>Sicurezza e amministrazione</h3><p>Autenticazione, controllo degli accessi, prevenzione degli abusi, diagnosi di errori e tutela dell’infrastruttura. Base giuridica: legittimo interesse ai sensi dell’art. 6(1)(f) GDPR.</p></div>
            <div className="legal-card"><h3>Obblighi di legge</h3><p>Conservazione o comunicazione di dati quando necessario per adempiere a obblighi normativi o richieste legittime delle autorità. Base giuridica: art. 6(1)(c) GDPR.</p></div>
          </div>
        </section>

        <section>
          <h2>4. Intelligenza artificiale, OpenRouter e model provider</h2>
          <p>Per le funzioni AI, il server di VoxBoard AI invia a <strong>OpenRouter</strong> il testo dell’aggiornamento e una rappresentazione compatta del piano corrente necessaria a decidere quali modifiche applicare. Per la dettatura invia invece il file audio necessario alla trascrizione.</p>
          <p>OpenRouter inoltra le richieste al model provider selezionato o individuato dal routing. Le pratiche di conservazione e di utilizzo dei dati possono variare tra provider e modelli. OpenRouter dichiara che, salvo impostazioni opzionali, non conserva di default prompt e risposte, mentre conserva metadati tecnici delle richieste; i singoli provider possono avere policy differenti.</p>
          <p>Prima di inserire dati personali sensibili o informazioni riservate, l’organizzazione che usa VoxBoard AI deve verificare che modello, provider e impostazioni OpenRouter siano coerenti con i propri requisiti di protezione dei dati.</p>
          <p>Riferimenti: <a href="https://openrouter.ai/privacy/" target="_blank" rel="noreferrer">Privacy Policy OpenRouter</a>{" · "}<a href="https://openrouter.ai/docs/guides/privacy/data-collection" target="_blank" rel="noreferrer">Data Collection</a>{" · "}<a href="https://openrouter.ai/docs/guides/privacy/provider-logging/" target="_blank" rel="noreferrer">Provider Logging</a>.</p>
        </section>

        <section>
          <h2>5. Destinatari e trasferimenti</h2>
          <p>I dati possono essere trattati da fornitori tecnici necessari all’erogazione del servizio, inclusi infrastruttura hosting/server, database e servizi AI. OpenRouter e i model provider possono operare anche fuori dallo Spazio Economico Europeo. OpenRouter indica che i dati possono essere trasferiti negli Stati Uniti o in altri Paesi; eventuali trasferimenti dipendono anche dal provider selezionato e dalle relative garanzie applicabili.</p>
        </section>

        <section>
          <h2>6. Tempi di conservazione</h2>
          <ul>
            <li><strong>Sessione autenticata:</strong> fino a 30 giorni, salvo logout anticipato.</li>
            <li><strong>Account, workspace e board:</strong> finché l’account o il workspace restano attivi o finché necessari all’erogazione del servizio.</li>
            <li><strong>Audit log:</strong> conservato insieme al workspace per mantenere la tracciabilità delle modifiche, salvo cancellazione richiesta o necessità di ridurne la conservazione.</li>
            <li><strong>File audio:</strong> non viene conservato nel database di VoxBoard AI dopo la richiesta di trascrizione.</li>
            <li><strong>Log infrastrutturali:</strong> per il tempo necessario a sicurezza, diagnosi e funzionamento del servizio, secondo le configurazioni dell’infrastruttura.</li>
          </ul>
        </section>

        <section>
          <h2>7. Cookie e strumenti locali</h2>
          <p>VoxBoard AI utilizza soltanto strumenti tecnici necessari o funzionali al servizio: cookie di sessione per mantenere l’accesso e localStorage per ricordare preferenza del tema e chiusura dell’avviso cookie. Non sono attualmente presenti cookie pubblicitari, di profilazione o strumenti analytics.</p>
          <p><a href="/cookies">Leggi la Cookie Policy completa →</a></p>
        </section>

        <section>
          <h2>8. Dati particolari e informazioni riservate</h2>
          <p>VoxBoard AI non è progettato per raccogliere categorie particolari di dati personali ai sensi dell’art. 9 GDPR. Evita di inserire dati sanitari, biometrici, politici, sindacali, religiosi o altre informazioni altamente sensibili, salvo che la tua organizzazione disponga di un’idonea base giuridica e di misure adeguate.</p>
        </section>

        <section>
          <h2>9. Diritti degli interessati</h2>
          <p>Nei casi previsti dal GDPR puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità, opposizione e le altre tutele previste dagli artt. 15–22 GDPR. Puoi inoltre proporre reclamo al Garante per la protezione dei dati personali.</p>
          <p>Per esercitare i tuoi diritti: <a href="mailto:lorenzoprandi.lav@gmail.com">lorenzoprandi.lav@gmail.com</a>.</p>
        </section>

        <section><h2>10. Modifiche a questa informativa</h2><p>La presente informativa può essere aggiornata quando cambiano funzionalità, fornitori, basi giuridiche o modalità di trattamento. La data indicata in alto identifica la versione corrente.</p></section>
      </main>
      <PublicFooter />
    </div>
  );
}

import type { Metadata } from "next";
import { Topbar } from "@/components/Topbar";
import { PublicFooter } from "@/components/PublicFooter";

export const metadata: Metadata = { title: "Usare l’AI in modo consapevole" };

export default function AiLiteracy() {
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="legal-page">
        <span className="eyebrow">Guida AI</span>
        <h1>Usare BoardCue in modo consapevole</h1>
        <p className="legal-updated">Guida per owner, amministratori e membri · 23 settembre 2026</p>
        <section>
          <h2>Cosa fa l’AI</h2>
          <p>
            Legge il tuo aggiornamento e un contesto ridotto della board e propone azioni precise: creare, aggiornare, spostare o archiviare
            card. Prima che qualcosa cambi vedi un’anteprima con ogni modifica e puoi applicarle tutte, solo alcune o nessuna. Se la frase è
            ambigua, l’AI chiede quale card intendi invece di indovinare.
          </p>
        </section>
        <section>
          <h2>Dove vanno i dati</h2>
          <p>
            Le richieste passano da OpenRouter e raggiungono solo provider con zero data retention: il provider non conserva e non addestra
            sui tuoi dati. L’audio della dettatura viene trascritto e scartato.
          </p>
        </section>
        <section>
          <h2>Cosa non deve fare</h2>
          <ul>
            <li>Valutare, classificare o confrontare le prestazioni delle persone.</li>
            <li>Assegnare automaticamente persone alle card.</li>
            <li>Prendere decisioni su assunzioni, promozioni o cessazioni.</li>
            <li>Ricevere segreti, dati sanitari o altre informazioni non necessarie.</li>
          </ul>
        </section>
        <section>
          <h2>Controllo umano</h2>
          <p>
            Controlla l’anteprima prima di applicare, soprattutto per date e archiviazioni. Ogni aggiornamento applicato compare nel
            pannello Attività con autore e dettaglio, e si annulla con un clic finché le card non vengono modificate da altri.
            L’applicazione automatica è disattivata di default e si attiva solo dalle preferenze personali.
          </p>
        </section>
        <section>
          <h2>Segnalazioni</h2>
          <p>
            Segnala interpretazioni errate ricorrenti, accessi non autorizzati o dati inseriti per errore ai contatti indicati nel footer.
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

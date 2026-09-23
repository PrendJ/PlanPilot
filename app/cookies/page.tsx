import type { Metadata } from "next";
import { Topbar } from "@/components/Topbar";
import { PublicFooter } from "@/components/PublicFooter";

export const metadata: Metadata = { title: "Cookie Policy" };

const cookies = [
  [
    "boardcue_session",
    "Mantiene l’accesso e consente di aprire le board autorizzate.",
    "Fino a 30 giorni o al logout",
    "Tecnico · HttpOnly · SameSite=Lax · Secure",
  ],
  [
    "boardcue_2fa",
    "Ricorda per pochi minuti che la password è corretta mentre inserisci il codice della verifica in due passaggi.",
    "5 minuti",
    "Tecnico · HttpOnly · SameSite=Lax · Secure",
  ],
  ["boardcue_locale", "Ricorda la lingua dell’interfaccia (italiano o inglese).", "12 mesi", "Preferenza · SameSite=Lax"],
  [
    "voxboard_session",
    "Cookie legacy accettato solo per sessioni aperte prima del cambio nome.",
    "Fino alla scadenza (max 30 giorni)",
    "Tecnico legacy",
  ],
] as const;

const storage = [
  ["theme", "Tema chiaro, scuro o di sistema."],
  ["boardcue_cookie_notice_v1", "Ricorda che hai chiuso questo avviso."],
  ["boardcue:view:<board>", "Vista preferita della board (kanban, lista, calendario)."],
  ["boardcue:draft:<board>", "Bozza non inviata dell’aggiornamento (session storage, solo in questa scheda)."],
] as const;

export default function CookiesPage() {
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="legal-page" style={{ width: "min(900px, 100% - 32px)" }}>
        <span className="eyebrow">Cookie Policy</span>
        <h1>Cookie Policy di BoardCue</h1>
        <p className="legal-updated">Ultimo aggiornamento: 23 settembre 2026</p>
        <section>
          <h2>In breve</h2>
          <p>
            BoardCue usa solo cookie tecnici e di preferenza. Nessun cookie pubblicitario, di profilazione o di analisi di terze parti: per
            questo non serve un banner di consenso.
          </p>
        </section>
        <section>
          <h2>Cookie</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Finalità</th>
                  <th>Durata</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {cookies.map(row => (
                  <tr key={row[0]}>
                    <td>
                      <code>{row[0]}</code>
                    </td>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                    <td>{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2>Archiviazione locale del browser</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Chiave</th>
                  <th>Finalità</th>
                </tr>
              </thead>
              <tbody>
                {storage.map(row => (
                  <tr key={row[0]}>
                    <td>
                      <code>{row[0]}</code>
                    </td>
                    <td>{row[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="subtle" style={{ marginTop: 8 }}>
            Restano nel browser finché non cancelli i dati del sito.
          </p>
        </section>
        <section>
          <h2>Come cancellarli</h2>
          <p>Puoi eliminare cookie e dati locali dalle impostazioni del browser; dovrai poi accedere di nuovo.</p>
        </section>
        <section>
          <h2>Contatti</h2>
          <p>
            Titolare: <strong>{process.env.LEGAL_ENTITY_NAME || "Lorenzo Prandi – Draftapps"}</strong>. Vedi anche la{" "}
            <a href="/privacy">Privacy Policy</a>.
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

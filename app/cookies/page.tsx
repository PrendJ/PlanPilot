import { Topbar } from "@/components/Topbar";
import { PublicFooter } from "@/components/PublicFooter";

const CONTACT_URL = "https://draftapps.it/#contatti";

export default function CookiesPage() {
  return (
    <div className="shell">
      <Topbar />
      <main className="legal-page">
        <div className="pill">COOKIE POLICY</div>
        <h1>Cookie Policy di BoardCue AI</h1>
        <p className="legal-updated">Ultimo aggiornamento: 18 agosto 2026</p>
        <section><h2>In breve</h2><p>BoardCue AI non utilizza attualmente cookie pubblicitari, di profilazione o strumenti analytics. Gli strumenti presenti sono tecnici o funzionali al servizio.</p></section>
        <section><h2>Cookie tecnico di sessione</h2><div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Nome</th><th>Finalità</th><th>Durata</th><th>Tipo</th></tr></thead><tbody><tr><td><code>boardcue_session</code></td><td>Mantiene autenticato l’utente e consente di accedere ai workspace autorizzati.</td><td>Fino a 30 giorni o fino al logout.</td><td>Tecnico, HttpOnly, SameSite=Lax; Secure in produzione.</td></tr><tr><td><code>voxboard_session</code></td><td>Cookie legacy accettato temporaneamente durante il cambio nome per non interrompere le sessioni già aperte; non viene più creato nei nuovi login.</td><td>Fino alla sua scadenza, massimo 30 giorni dalla creazione.</td><td>Tecnico legacy.</td></tr></tbody></table></div></section>
        <section><h2>Local storage e session storage</h2><div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Chiave</th><th>Finalità</th><th>Durata</th></tr></thead><tbody><tr><td><code>theme</code></td><td>Ricorda il tema chiaro o scuro.</td><td>Finché non cancelli i dati del sito.</td></tr><tr><td><code>boardcue_cookie_notice_v1</code></td><td>Ricorda che hai chiuso l’avviso informativo sui cookie tecnici.</td><td>Finché non cancelli i dati del sito.</td></tr><tr><td><code>boardcue:workspace:column</code></td><td>Ricorda la colonna attiva nel browser.</td><td>Fino alla chiusura della scheda.</td></tr></tbody></table></div><p>Questi strumenti vengono usati soltanto per preferenze tecniche dell’interfaccia.</p></section>
        <section><h2>Perché non compare “Accetta tutti”</h2><p>BoardCue AI usa soltanto strumenti tecnici necessari o preferenze funzionali e non attiva finalità pubblicitarie, analytics o profilazione che richiedano un consenso dedicato. Se in futuro saranno introdotti strumenti non tecnici, policy e gestione delle preferenze verranno aggiornate prima dell’attivazione.</p></section>
        <section><h2>Come cancellare cookie e dati locali</h2><p>Puoi eliminare cookie e localStorage dalle impostazioni del browser. La cancellazione del cookie di sessione comporta la necessità di effettuare nuovamente il login.</p></section>
        <section><h2>Titolare e contatti</h2><p>Il titolare è <strong>Lorenzo Prandi – Draftapps</strong>. Per informazioni utilizza la <a href={CONTACT_URL} target="_blank" rel="noreferrer">sezione contatti di Draftapps</a>.</p><p><a href="/privacy">Consulta anche la Privacy Policy →</a></p></section>
      </main>
      <PublicFooter />
    </div>
  );
}

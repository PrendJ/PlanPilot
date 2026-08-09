import { Topbar } from "@/components/Topbar";
import { PublicFooter } from "@/components/PublicFooter";

export default function CookiesPage() {
  return (
    <div className="shell">
      <Topbar />
      <main className="legal-page">
        <div className="pill">COOKIE POLICY</div>
        <h1>Cookie Policy di VoxBoard AI</h1>
        <p className="legal-updated">Ultimo aggiornamento: 9 agosto 2026</p>

        <section>
          <h2>In breve</h2>
          <p>VoxBoard AI non utilizza attualmente cookie pubblicitari, di profilazione o strumenti analytics. Gli strumenti presenti sono tecnici o funzionali al servizio e non vengono usati per tracciare la navigazione a fini commerciali.</p>
        </section>

        <section>
          <h2>Cookie tecnico di sessione</h2>
          <div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Nome</th><th>Finalità</th><th>Durata</th><th>Tipo</th></tr></thead><tbody><tr><td><code>voxboard_session</code></td><td>Mantiene autenticato l’utente e consente di accedere ai workspace autorizzati.</td><td>Fino a 30 giorni o fino al logout.</td><td>Tecnico, HttpOnly, SameSite=Lax; Secure in produzione.</td></tr></tbody></table></div>
          <p>Il cookie viene creato soltanto dopo un login riuscito. È necessario per fornire l’area autenticata e non viene utilizzato per profilazione o pubblicità.</p>
        </section>

        <section>
          <h2>Local storage</h2>
          <div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Chiave</th><th>Finalità</th><th>Durata</th></tr></thead><tbody><tr><td><code>theme</code></td><td>Ricorda se preferisci il tema chiaro o scuro.</td><td>Finché non cancelli i dati del sito.</td></tr><tr><td><code>voxboard_cookie_notice_v1</code></td><td>Ricorda che hai chiuso l’avviso informativo sui cookie tecnici.</td><td>Finché non cancelli i dati del sito.</td></tr></tbody></table></div>
          <p>Il localStorage non è un cookie, ma rientra tra le tecnologie di memorizzazione sul dispositivo. In VoxBoard AI viene usato soltanto per preferenze tecniche dell’interfaccia.</p>
        </section>

        <section>
          <h2>Perché non compare “Accetta tutti”</h2>
          <p>Poiché allo stato attuale VoxBoard AI utilizza soltanto strumenti tecnici necessari o equivalenti a preferenze funzionali richieste dall’utente, non viene richiesto un consenso per finalità pubblicitarie, analytics o profilazione che non esistono. L’avviso mostrato sul sito ha quindi funzione informativa e può essere semplicemente chiuso.</p>
          <p>Se in futuro saranno introdotti analytics non tecnici, advertising, profilazione o altri strumenti che richiedono consenso, questa policy e il meccanismo di gestione delle preferenze verranno aggiornati prima della loro attivazione.</p>
        </section>

        <section>
          <h2>Come cancellare cookie e dati locali</h2>
          <p>Puoi eliminare cookie e localStorage dalle impostazioni del browser. La cancellazione del cookie di sessione comporta la necessità di effettuare nuovamente il login; la cancellazione delle preferenze locali ripristina le impostazioni dell’interfaccia.</p>
        </section>

        <section>
          <h2>Titolare e contatti</h2>
          <p>Il titolare è <strong>Lorenzo Prandi – Draftapps</strong>. Per informazioni: <a href="mailto:lorenzoprandi.lav@gmail.com">lorenzoprandi.lav@gmail.com</a>.</p>
          <p><a href="/privacy">Consulta anche la Privacy Policy →</a></p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

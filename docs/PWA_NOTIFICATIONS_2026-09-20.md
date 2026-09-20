# BoardCue — webapp installabile e notifiche, 20 settembre 2026

## Mandato e stato verificato

L'ultima istruzione del titolare è **solo commit, senza push né deploy**, con notifiche dei progetti anche ad app chiusa. Questo incremento include le precedenti modifiche di sicurezza ancora non committate, descritte in [audit](AUDIT_2026-09-19.md) e [copertura AI](AI_ACCEPTANCE_2026-09-19.md). Non dichiara chiuso il backlog di evoluzione.

Alla baseline `001d53a`, BoardCue non aveva manifest, service worker, installazione guidata o Web Push. Il progetto locale FantAssistant ha fornito il riferimento per installazione e aggiornamenti espliciti, ma non implementava le notifiche dei progetti richieste. La sua cache dell'intera app non è stata copiata: BoardCue contiene pagine autenticate servite dal backend.

## Incremento scelto e comportamento

- Manifest con identità stabile, icone PNG opache ricavate dal marchio esistente, icona Apple e icona maskable. Pulsante **App** nella navigazione pubblica e autenticata, installazione nativa quando offerta dal browser e istruzioni alternative. Nessuna promessa di installazione universale.
- Service worker generato per ciascuna build. Cache limitata a risorse statiche pubbliche e pagina offline generica; nessuna cache di HTML autenticato, API, RSC, prompt o contenuti delle board. Offline è possibile conservare una bozza lasciando aperta la pagina; lettura e scrittura dei progetti richiedono rete.
- Aggiornamento in attesa fino a un clic esplicito. Nessun reload automatico delle altre finestre. Bozza board, registrazione audio, operazione in corso o editor aperto bloccano il pulsante; per moduli account modificati si richiede di salvare e tornare alla Home. La cache della build precedente viene mantenuta per le finestre già aperte.
- Web Push con consenso esplicito, collegato alla sessione del browser. Avvisa delle mutazioni di card/colonne e batch AI/undo registrati da `logActivity`, effettuate da altri membri. Non è un sistema di promemoria scadenze; gli altri eventi che non passano da questa funzione non producono push.
- Coda inserita nella stessa transazione della modifica; un avviso per destinatario/batch, nessuno al suo autore o a utenti esterni al progetto. Invio separato tramite job periodico; sessione, account, ruolo, membership e lifecycle ricontrollati sotto lock prima dell'invio. Logout elimina iscrizioni e coda attraverso cascata. Iscrizioni ripetute non cancellano la coda; un endpoint non può essere trasferito a un altro account.
- Payload cifrato contenente soltanto un identificatore opaco di deduplicazione. Testo e destinazione sono fissi nel worker: nessun nome cliente, nome progetto, prompt o attività. Il clic porta a `/app`, oppure mette a fuoco una finestra esistente senza abbandonarne la bozza. Un avviso già consegnato al sistema operativo non può essere ritirato dopo una revoca; rimane generico.
- Lease per job, massimo tre tentativi, backoff e cancellazione degli endpoint scaduti. Il trasporto non garantisce exactly-once: un acknowledgment perso può causare un retry, coalescente tramite tag/topic. Le nuove consegne pendenti vengono eliminate entro il successivo job dopo 24 ore; TTL lato servizio push un'ora. Nessuna modifica alla retention delle entità preesistenti.

## File e motivazioni

| Gruppo | File | Motivo |
|---|---|---|
| UI e installazione | `components/PwaProvider.tsx`, `NotificationsPanel.tsx`, `Topbar.tsx`, `Board.tsx`, `app/layout.tsx`, `app/pwa.css` | Installazione, preferenze, errori, accessibilità e protezione bozze |
| Risorse pubbliche | `public/manifest.webmanifest`, `offline.html`, `icons/*`, `scripts/build-icons.mjs`, `build-pwa.mjs`, `service-worker.js`, `next.config.ts` | Identità installabile, aggiornamenti versionati e cache senza dati privati |
| Push server | `lib/push-config.ts`, `push.ts`, `auth.ts`, `board.ts`, API `notifications/subscription` e `cron/notifications` | Validazione endpoint contro SSRF, ownership, autorizzazione e coda transazionale |
| Schema | `prisma/schema.prisma`, `prisma/migrations/0010_web_push/migration.sql` | Due sole tabelle aggiuntive: iscrizioni e consegne pendenti |
| Esercizio | `.env.example`, `docker-compose.yml`, `Dockerfile`, `scripts/dispatch-notifications.mjs`, `package*.json` | Flag, job schedulabile, dipendenze riproducibili e patch di sicurezza |
| QA | `tests/pwa.test.ts`, `push.test.ts`, `push-postgres.test.ts`, `e2e/pwa.spec.ts`, `scripts/test-local-postgres.mjs`, `playwright.config.ts`, `e2e/public.spec.ts` | Worker, permessi, transazioni reali, UI desktop/mobile e harness isolato |

Le correzioni di sicurezza precedenti riguardano `lib/ai-patch.ts`, `lib/openrouter.ts`, le route card/colonne/ingest/undo, `lib/board.ts` e relativi test. Vedere il report del 19 settembre per ticket e motivazioni analitiche. La richiesta PWA/push è un incremento aggiuntivo, non una chiusura nominale dei ticket del brief.

Next passa da 15.5.23 a 15.5.25, Nodemailer da 9.0.5 a 9.1.1, sharp da 0.35.0 a 0.35.4; aggiornata la dipendenza transitiva qs. Aggiunti `web-push@3.6.7` e soli tipi di sviluppo. Nessun nuovo framework, backend o provider AI. Restano due segnalazioni moderate del tooling Vitest 3; non viene esposto un server Vitest in rete e il salto major resta separato. Il container usa `npm ci`.

Il precedente avvio eseguiva automaticamente `recover-failed-0006.mjs`, che contiene operazioni di eliminazione schema ed è inadatto a un recupero automatico. Ora una migrazione fallita blocca l'avvio e richiede diagnosi esplicita; lo script storico non è stato eseguito né eliminato.

## Configurazione per un futuro rilascio autorizzato

1. Usare HTTPS, applicare le migrazioni versionate e verificare `/manifest.webmanifest`, `/sw.js`, icone e pagina offline. Il worker viene generato da `npm run build`, non è committato. `/sw.js` ha `Cache-Control: no-cache, no-store, must-revalidate` e scope `/`.
2. Le notifiche sono **disattivate per default**. Prima dell'abilitazione il titolare deve confermare trattamento e informativa per i servizi push scelti automaticamente dai browser (Apple, Google, Mozilla, eventuale Windows). I documenti legali definitivi e l'elenco contrattuale dei subprocessori non sono stati modificati. Non è stata inviata alcuna notifica reale.
3. Generare una coppia VAPID una sola volta con `web-push.generateVAPIDKeys()` in un ambiente sicuro; salvare la chiave privata nel gestore dei segreti, senza committarla o stamparla nei log. Impostare `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (contatto `mailto:` o URL HTTPS del titolare), `CRON_SECRET` e infine `WEB_PUSH_ENABLED=true`. Conservare le stesse chiavi nei successivi deploy; una rotazione richiede riattivazione delle iscrizioni.
4. Configurare un job ogni minuto **nel container app**: `node scripts/dispatch-notifications.mjs`. Legge il segreto dall'ambiente e invoca solo il server su loopback. Non invocare il cron di retention come test: può cancellare dati e inviare email. Senza questo job gli aggiornamenti si accodano ma non arrivano a app chiusa.
5. Eseguire una prova autorizzata su dispositivi reali con due account di test: opt-in, modifica di un collega, chiusura app, ricezione, apertura, revoca accesso e logout. Su iOS/iPadOS serve una webapp nella Home e versione 16.4 o successiva. Browser, sistema operativo, risparmio energetico e impostazioni utente possono ritardare o sopprimere gli avvisi.

Riferimenti primari: [installabilità MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [WebKit: Web Push iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [libreria Web Push](https://github.com/web-push-libs/web-push).

## Verifiche e limiti

Baseline precedente: 59 test unitari; successivamente 127 passati, 9 PostgreSQL saltati per assenza di runtime. Baseline browser desktop/mobile: 14 passati, 1 skip mouse su mobile, 1 fallimento del drag demo. Il drag test usava coordinate fuori viewport; ora usa scroll e `dragTo` mantenendo le stesse asserzioni di spostamento.

L'harness aggiunto installa PostgreSQL **separatamente** dalle dipendenze del prodotto, usa una directory temporanea, porta loopback e database `boardcue_test_integration`. Nessun database di produzione, account reale, email o chiamata AI. Il runtime viene fermato anche in caso di fallimento; restano soltanto dati sintetici nella directory temporanea. La suite reale ha individuato e corretto la dipendenza dal fuso orario nelle nuove consegne: i timestamp sono inseriti esplicitamente in UTC e la scadenza della sessione è confrontata in UTC anche su host non UTC.

Comandi realmente eseguiti e riproducibili:

```powershell
npm run typecheck
npm test
# Runtime opzionale installato fuori dal repository:
npm install --prefix "$env:TEMP/boardcue-pg-runtime" --save-exact embedded-postgres@16.14.0-beta.17
$env:BOARDCUE_EMBEDDED_PG_MODULE="$env:TEMP/boardcue-pg-runtime/node_modules/embedded-postgres/dist/index.js"
node scripts/test-local-postgres.mjs --e2e
npm audit --omit=dev --json
git diff --check
```

L'harness esegue realmente `prisma migrate deploy`, Vitest, `next build`, generazione worker e preparazione standalone, poi Playwright sui profili desktop 1440 e mobile 375. Trasporto Web Push e permessi negati sono simulati; autorizzazione/rollback/lease sono verificati anche su PostgreSQL reale. I test browser usano un worker reale per offline/privacy e una fixture dichiarata per l'aggiornamento in attesa. Non equivalgono a un'installazione su iPhone/Android né a una push ricevuta da servizi reali. Nessun test visuale viene dedotto dalla sola compilazione.

Risultati conclusivi del 20 settembre:

| Controllo | Risultato |
|---|---|
| `npm run typecheck` | Passato |
| `npm test` senza DB opt-in | 157 passati, 21 integrazioni saltate intenzionalmente |
| Harness PostgreSQL 16.14 temporaneo | Tutte le 10 migrazioni applicate; 178 test passati, nessuno saltato |
| `next build` e generazione worker nell'harness | Passati; nessun servizio esterno invocato |
| Playwright desktop 1440/mobile 375 | 27 passati, 1 skip del drag mouse sul profilo mobile |
| `npm audit --omit=dev --json` | 0 vulnerabilità di produzione segnalate alla verifica; 2 moderate nel tooling Vitest escluso dal runtime |
| `git diff --check` | Passato |

Ispezionate direttamente le schermate generate: [dialogo mobile](qa/2026-09-20/pwa-mobile.png), [dialogo desktop](qa/2026-09-20/pwa-desktop.png) e board mobile con bozza/errore offline. Controllati contrasto, disposizione, focus visibile, contenuti scorribili; Playwright verifica tastiera/Escape/ripristino focus, assenza overflow, negazione permessi, aggiornamento esplicito, errore rete e salvataggio manuale autenticato. Un avviso spurio alla prima registrazione del worker è stato corretto dopo questa ispezione e coperto dal test browser.

Le prime prove UI avevano selezionato il pulsante App nella pagina login, che non usa la navigazione Topbar; corrette sul percorso effettivo `/demo`. Su mobile l'informativa cookie si sovrapponeva ai controlli sottostanti: il percorso verificato la chiude esplicitamente prima delle operazioni. Non modificata l'informativa. Nessuna prova manuale su telefono fisico, push reale, microfono reale, installazione OS o sessione Coolify.

## Rollback e rischi residui

- Stop job e `WEB_PUSH_ENABLED=false` fermano accodamento e invio. Migrazione additiva, senza conversioni di stati o rinomina entità persistenti; per rollback applicativo lasciare le due nuove tabelle inerti, senza cancellazioni.
- Se si torna a un commit precedente alla PWA, mantenere temporaneamente `/sw.js` compatibile o pubblicare un worker di dismissione controllato: rimuovere soltanto il file non disinstalla i worker già registrati. La cache attuale non contiene dati privati.
- Il flag va attivato solo con chiavi e job pronti. Non è stato configurato alcun ambiente remoto. Docker daemon non disponibile: nessuna build immagine o prova Coolify eseguita; verificata la build standalone locale.
- La prima installazione e la ricezione push su dispositivi fisici restano da verificare. Le finestre aperte per più di una versione potrebbero dover ricaricare risorse non più disponibili dopo ulteriori deploy; la bozza non viene persistita su disco.
- Restano i limiti AI dell'audit: invio attuale applica direttamente, assenza di proposta/conferma e receipt idempotente, quota concorrente e altri ticket fuori incremento. Non dichiarare il nuovo flusso AI pronto per produzione né miglioramenti di conversione/accuratezza non misurati.

Prossimo incremento consigliato: proposta AI persistente per un progetto, conferma esplicita, scadenza e applicazione idempotente, preservando la guardia transazionale esistente. Prima dell'abilitazione push: decisione del titolare sull'informativa e prova reale autorizzata.

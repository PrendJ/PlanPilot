# Correzioni di sicurezza — 28 ottobre 2026

Le correzioni dei 14 rilievi dell'[audit iniziale](SECURITY_AUDIT_2026-10-28.md) sono implementate nel checkout locale. Il rapporto iniziale e le sue prove restano conservati come fotografia precedente alle modifiche. **Il sito pubblicato non è stato aggiornato da questa attività.**

## Rilievi corretti

| Rilievo | Correzione e verifica |
|---|---|
| SEC-01 — escalation amministrativa | SUPPORT/BILLING non possono modificare `isAdmin`, `platformRole`, verifica email o esenzione dai pagamenti. Test HTTP sui singoli campi e sulle combinazioni; stato del database invariato. |
| SEC-02 — 2FA obbligatoria | Guardia API comune, token personali, ricerca, esportazione, stampa, pagine private, feed calendario, notifiche e Telegram rispettano l'obbligo di attivazione. Le API di attivazione e logout restano raggiungibili. Test HTTP e browser verificano il blocco dei contenuti. |
| SEC-03 — preregistrazione di email altrui | La prima prova indipendente della mailbox invalida password precedente, sessioni, token, fattori e collegamenti personali; disattiva i webhook creati dall'account. La persona imposta una nuova password tramite un link breve. Un invito, noto anche a chi invita, non vale come verifica della mailbox. La creazione di webhook richiede email verificata. Le sessioni e le modifiche sensibili controllano nuovamente lo stato delle credenziali sotto lock. |
| SEC-04 — dipendenze vulnerabili | Aggiornati Next.js, Nodemailer, Zod, Vitest e dipendenze transitive segnalate; adattati diagnostica Zod e configurazione dei test. Lockfile aggiornato e installazioni CI riproducibili. |
| SEC-05 — origine delle richieste | Controllo centralizzato nel middleware per tutte le mutazioni API e controlli nei gestori amministrativi/logout. Solo l'origine di `APP_URL` è attendibile; gli header inoltrati non possono modificarla. JSON richiede il tipo di contenuto corretto. |
| SEC-06 — SSRF nei webhook | Normalizzazione IPv4/IPv6, esclusione delle reti speciali, HTTPS porta 443, validazione di tutti gli indirizzi DNS e connessione vincolata a un indirizzo già verificato. TLS verifica il nome originale; niente redirect o riuso di connessioni. Test del cambio di risposta DNS. |
| SEC-07 — reset concorrenti | Consumo atomico del link sotto lock dell'utente, verifica della scadenza nella transazione e revoca delle altre credenziali. Due reset simultanei producono un solo successo. |
| SEC-08 — codici di recupero concorrenti | Consumo condizionato alla lista precedente dei codici e al fattore corrente. Anche challenge, tentativi e consumo TOTP sono condizionali. Il test PostgreSQL accetta lo stesso codice una sola volta. |
| SEC-09 — ultimo owner | Modifiche delle membership serializzate per organizzazione e board; permessi, posti e presenza dell'ultimo owner ricontrollati nella transazione. Due demozioni simultanee lasciano un owner. Accettazione inviti atomica, senza demozioni da inviti vecchi. |
| SEC-10 — metadati privati | Titolo della board generato solo dopo autorizzazione, controllo lifecycle e 2FA. Estranei e sessioni invalide ricevono metadati generici. |
| SEC-11 — formule CSV | Celle che iniziano con formule, spazi seguiti da formule o caratteri di controllo vengono neutralizzate prima dell'escaping CSV. Test sui prefissi rischiosi. |
| SEC-12 — host/IP inoltrati | Link email basati sulla configurazione canonica, mai sull'host della richiesta in produzione. IP inoltrati ignorati salvo configurazione esplicita del numero di proxy affidabili; lettura dalla destra della catena. |
| SEC-13 — backup ingannevole | Dump e verifica dell'archivio devono riuscire prima della cifratura e della retention. Nuovi backup autenticati AES-256-GCM con chiave derivata tramite scrypt e pubblicazione atomica. Il restore autentica l'intero file prima di usarlo. Test su chiave errata, corruzione e fallimento del dump. |
| SEC-14 — script inline | CSP con nonce distinto per richiesta, propagato agli script Next.js, tema e dati strutturati. Nessun `unsafe-inline` o `unsafe-eval` in `script-src` di produzione. Test browser con script senza nonce inserito nel documento HTML, effettivamente bloccato. Gli stili inline restano consentiti per compatibilità con l'interfaccia. |

## Ulteriori protezioni

- Token API con scadenza di 90 giorni e scelta tra sola lettura e lettura/scrittura, visibili nell'account. Reset password e cambio password revocano token e collegamenti personali; il cambio password conserva solo la sessione corrente.
- Bozze separate per utente; pulizia dei dati privati del browser al logout, insieme a `Clear-Site-Data`.
- Risposte API private senza cache; lettura dei corpi delle richieste con limiti di dimensione e tempo, comprese richieste senza `Content-Length`, import e upload.
- Limite alle connessioni eventi simultanee e rilascio degli slot alla chiusura. Memoria del rate limiter di emergenza limitata; i limiti condivisi usano PostgreSQL.
- SMTP richiede TLS e ha timeout espliciti. I test e la replica isolata non inviano email o richieste ai provider a pagamento.
- CI esegue anche i test PostgreSQL prima facoltativi e controlla gli advisory delle dipendenze.

## Validazione

| Verifica finale | Esito |
|---|---|
| TypeScript e generazione client Prisma | Superati |
| Test unitari e integrazione PostgreSQL | **425 passati, 44 file, zero saltati** |
| Build di produzione Next.js 15.5.28 e PWA | Superata |
| Browser desktop 1440 e mobile 375 | **51 passati, 11 saltati intenzionalmente, zero falliti** |
| Audit dipendenze, incluse quelle di sviluppo | **Zero advisory segnalati** |
| Ispezione browser interattiva | Login visualizzato e interazione funzionante con CSP a nonce |

Esecuzione finale: vedi [registro completo](security/2026-10-28/remediation/verification.log), [audit delle dipendenze](security/2026-10-28/remediation/npm-audit.json) e [controllo dei tipi](security/2026-10-28/remediation/typecheck.log).

La suite usa un PostgreSQL temporaneo, account `example.invalid`, build di produzione e browser desktop/mobile. Il database applicativo e la produzione non sono utilizzati. Le prove di concorrenza includono reset password, codici di recupero, login con credenziali precedenti alla verifica e modifiche degli owner.

I test browser dei casi di abuso vengono eseguiti una volta sul progetto desktop; le corrispondenti copie mobile sono saltate intenzionalmente. Gli altri salti riguardano percorsi duplicati o test non applicabili al progetto. Una precedente esecuzione aveva tutti i casi di sicurezza verdi ma un errore di avvio di Chromium: l'esecuzione finale riduce la concorrenza dei browser.

Prove visive: [pagina di accesso finale](security/2026-10-28/remediation/browser-login.png), [script senza nonce bloccato senza interrompere il login](security/2026-10-28/remediation/csp-login.png), [stampa privata reindirizzata all'attivazione 2FA](security/2026-10-28/remediation/required-enrollment.png). Gli account raffigurati sono sintetici.

## Applicazione al deployment

1. Rilasciare prima in staging con database separato. Conservare un backup verificato prima del rilascio in produzione. Il checkout contiene modifiche dell'utente precedenti all'intervento, conservate durante il lavoro: il rilascio deve includere una revisione dell'intero diff.
2. Applicare la migrazione additiva `0015_security_token_expiry`. I token già presenti ricevono scadenza a 90 giorni dalla migrazione e mantengono i permessi di scrittura per compatibilità. Il container usa già lo script di migrazione all'avvio. Un rollback del codice precedente farebbe perdere l'applicazione della scadenza e delle nuove guardie, anche lasciando intatto lo schema.
3. Impostare `APP_URL` all'origine HTTPS esatta del deployment. Verificare che il reverse proxy non memorizzi le pagine con CSP dinamica: il nonce nell'HTML deve corrispondere a quello nell'header. Non sovrascrivere la CSP con quella vecchia nel proxy.
4. `TRUSTED_PROXY_HOPS=0` è il valore prudenziale: le richieste condividono il bucket IP `unknown`. Per limiti distinti per IP, configurare il numero corretto di hop **solo dopo aver verificato** che l'app sia irraggiungibile direttamente e che l'ingresso aggiunga l'indirizzo reale alla catena. Provare con header contraffatti attraverso l'ingresso effettivo.
5. Installare Node.js 22 o superiore sull'host che esegue gli script di backup e distribuire anche `backup-crypto.mjs`. Conservare separatamente la passphrase. I nuovi dump usano GCM; il restore mantiene una lettura transitoria dei vecchi dump CBC. Un restore reale in Docker e lo storage fuori sede devono essere verificati dall'operatore: qui sono stati testati cifratura e gestione dei fallimenti, non un archivio di produzione.
6. Verificare SMTP con TLS e i flussi reali di conferma email, reset, 2FA, token, calendario e Telegram in staging. La prima verifica email ora richiede di impostare una password; la revoca dei collegamenti personali richiede di riconnetterli.
7. Esaminare gli eventi amministrativi storici per promozioni inattese e valutare la revoca delle credenziali eventualmente esposte. Non sono state modificate credenziali reali né consultati log privati di produzione.

## Limiti residui

La validazione locale usa Windows, Node.js 24 e PostgreSQL 18; il container previsto usa Linux/Alpine, Node.js 22 e PostgreSQL 16. CI è configurata per Node.js 22/PostgreSQL 16, ma il suo risultato remoto non è stato eseguito qui. Mancano accesso e verifica autenticata del deployment, configurazione effettiva di proxy/cloud, restore di produzione e test di carico. I limiti delle connessioni SSE e il fallback del rate limiter sono per processo; il rate limiter PostgreSQL è condiviso.

Le vulnerabilità censite sono corrette nel codice esaminato; questo esito non certifica l'assenza di ogni possibile vulnerabilità e non descrive lo stato del sito finché non viene distribuita questa versione.

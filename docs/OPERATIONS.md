# BoardCue — operatività: deploy, job, backup, monitoraggio

> Guida per il rilascio della versione "commercial readiness" (settembre 2026). Nessun deploy viene eseguito dal repository: i passi qui sotto sono azioni del titolare.

## 1. Rilascio

1. **Staging prima della produzione.** Crea in Coolify una seconda risorsa Compose dallo stesso repository (branch o tag), con database separato e `APP_URL` di staging.
2. **Backup** della produzione (sezione 4) e verifica che il file sia leggibile.
3. **Variabili nuove** (vedi `.env.example`):
   - `APP_ENCRYPTION_KEY` — obbligatoria per la 2FA (stringa casuale lunga; non cambiarla dopo, altrimenti le 2FA esistenti vanno riattivate);
   - **Stripe: nessuna variabile nuova.** Bastano `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` già presenti: prodotti e prezzi dei nuovi piani vengono creati sull'account al primo checkout. Lascia invariati `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_TEAM` e `STRIPE_PRICE_STUDIO`: servono a riconoscere gli abbonati attuali (il vecchio Team da €24 diventa `TEAM_LEGACY` e mantiene 10 persone);
   - `LEGAL_ENTITY_NAME`, `LEGAL_VAT_NUMBER`, `LEGAL_ADDRESS`, `CONTACT_EMAIL`, `PRIVACY_EMAIL` — obbligatori per legge sul sito commerciale;
   - opzionali `AI_PROVIDER_ONLY` (vuoto = qualsiasi endpoint con zero conservazione) e `OPENROUTER_BASE_URL` (vuoto = endpoint standard; l'endpoint UE richiederebbe il piano OpenRouter Business);
   - `MONTHLY_FIXED_COST_EUR` con i tuoi costi reali;
   - `APP_VERSION` = tag del rilascio (compare in `/api/health`).
4. **Migrazione**: `0011_commercial_readiness` è additiva (nessuna colonna rimossa). Porta inoltre i workspace con modelli non più in catalogo sul modello predefinito (Gemini 2.5 Flash-Lite), rinomina il piano `TEAM` esistente in `TEAM_LEGACY` (il vecchio Team a prezzo fisso) e **azzera le date di eliminazione** dei team attivi (nessuna cancellazione per mancato pagamento). Il container la applica all'avvio con `prisma migrate deploy`.
5. **Deploy da tag** (es. `v2026.09.1`), mai da un branch in movimento.
6. **Smoke test**: lancia il workflow GitHub "Post-deploy smoke test" (o `curl https://…/api/health`). Controlla che `/` mostri la landing e non il login.
7. **Rollback**: ridistribuisci il tag precedente. La migrazione 0011 è compatibile all'indietro a livello di schema (solo aggiunte), ma i dati di proposte AI, commenti, notifiche e posti non sono letti dalla versione precedente. Prima di un rollback esegui `UPDATE "Organization" SET plan = 'TEAM' WHERE plan = 'TEAM_LEGACY';`, altrimenti la versione precedente tratterebbe quei team come in prova.

## 2. Job pianificati

| Frequenza | Chiamata | Cosa fa |
|---|---|---|
| ogni minuto | `node scripts/dispatch-notifications.mjs` nel container app (oppure `POST /api/cron/notifications`) | notifiche push e **webhook in uscita** (coda con retry) |
| ogni ora | `POST /api/cron/retention` con `Authorization: Bearer $CRON_SECRET` | verifica email (promemoria giorno 1 e 5, eliminazione dopo 7 giorni), email della prova (giorno 3, 2 giorni prima della fine, fine), congelamento dei team scaduti, promemoria scadenze card, **riepilogo giornaliero alle 8:00 (ora italiana)**, pulizia token/sessioni/proposte scadute, cambio USD→EUR |

## 3. Monitoraggio

- **Uptime e status page**: Uptime Kuma (self-hosted su Coolify) su `/api/health` ogni minuto; pubblica una status page (es. `status.tuodominio.it`).
- **Errori applicativi**: GlitchTip self-hosted (compatibile Sentry) o i log del container; gli errori delle API sono loggati con `console.error` senza dati personali.
- **Workflow GitHub** `smoke.yml`: controlla ogni 30 minuti health, pagine pubbliche e redirect delle aree private.

## 4. Backup e prova di ripristino

- Backup giornaliero cifrato: `BACKUP_DIR=/var/backups/boardcue BACKUP_PASSPHRASE=… scripts/backup-db.sh` (conserva 14 giorni; copia la cartella fuori dal server, es. con rclone verso uno storage UE).
- Prova di ripristino **mensile**: `scripts/restore-test.sh` ripristina l'ultimo dump in un container temporaneo e stampa i conteggi di utenti, board e card. Annota data ed esito.
- Conserva la passphrase in un gestore di password separato dal server.

## 5. AI: instradamento UE senza conservazione

- Le chiamate usano l'endpoint standard di OpenRouter (piano pay-as-you-go, fee 5,5% sui crediti). I provider possono essere fuori dall'UE.
- Ogni richiesta invia `provider: { zdr: true, data_collection: "deny", allow_fallbacks: true, require_parameters: true }`: solo endpoint a zero conservazione che non addestrano sui dati; il fallback può finire solo su un altro endpoint con gli stessi requisiti. Per fissare un provider usa `AI_PROVIDER_ONLY` (es. `google-vertex/eu`, senza costi aggiuntivi).
- Per l'instradamento interamente UE basta impostare `OPENROUTER_BASE_URL=https://eu.openrouter.ai/api/v1`, ma richiede il piano OpenRouter Business.
- Modelli: pianificazione `google/gemini-2.5-flash-lite` (alternative GPT-5 nano, Mistral Small, Gemini 2.5 Flash dalle impostazioni della board), dettatura `mistralai/voxtral-mini-transcribe`. Endpoint a zero conservazione: `GET https://openrouter.ai/api/v1/endpoints/zdr`.
- **Qualità**: `npx tsx scripts/ai-eval.ts` esegue i 200 casi del set di valutazione (serve `OPENROUTER_API_KEY`, costo stimato < €1) e scrive `ai-eval-report.json`. Eseguilo prima di cambiare modello o prompt.

## 6. Fatturazione elettronica

BoardCue raccoglie al checkout P.IVA (Stripe Tax ID), codice fiscale, codice SDI e PEC. Dal backoffice ("Esporta dati fiscali clienti") scarichi il CSV da importare nel software che trasmette le fatture allo SDI. La trasmissione allo SDI resta fuori da BoardCue.

Nella pagina prezzi il cliente sceglie "Aziende e professionisti" (IVA esclusa, P.IVA, SDI e PEC richiesti al checkout) oppure "Privati" (prezzo finale IVA inclusa, solo codice fiscale). Il tipo scelto viene salvato sull'abbonamento e sull'organizzazione (`legalType`) e usato anche per i pacchetti di aggiornamenti e il portale clienti.

## 7. Verifiche locali

```bash
npm test                 # unitari (i test PostgreSQL vengono saltati senza database)
npm run typecheck
npm run build
BOARDCUE_EMBEDDED_PG_MODULE=/percorso/embedded-postgres/dist/index.js node scripts/test-local-postgres.mjs --e2e
```

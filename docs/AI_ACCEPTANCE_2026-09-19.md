# Casi AI e applicazione — copertura del primo incremento

La specifica originale è conservata in `tests/fixtures/boardcue-acceptance-spec.json` (40 casi, dati sintetici del pacchetto del 19 settembre). Gli identificatori concettuali task/progetto sono adattati a Card/Workspace nei test. L'orologio dei record sintetici usa istanti UTC espliciti; nessun fuso viene dedotto dalla lingua.

**Tre livelli distinti:**

- `ai-patch.test.ts`: validatore reale, output costruiti a mano, nessun modello.
- `ai-write-routes.test.ts`: handler reali, provider simulato e store transazionale in memoria con rollback/serializzazione simulati. Verifica controllo ed effetti degli handler, non l'isolamento di PostgreSQL.
- `board-write-guard.test.ts`: contratto SQL e gestione risultati/errori; `board-postgres.test.ts`: integrazione reale predisposta ma saltata in questo ambiente. `openrouter.test.ts`: adapter con fetch simulato, incluso segnale di timeout, nessuna chiamata reale.

**Qualità interpretativa non valutata.** I casi di negazione/futuro/ipotesi/omonimia/date con risposta vuota costruita a mano provano esclusivamente che il backend conserva le card per tale risposta. Non provano che il modello produca quella risposta. Una frase ambigua con output formalmente valido ma semanticamente sbagliato resta un rischio del percorso legacy senza preview. Non aggiunti euristiche linguistiche o falsi punteggi di accuratezza.

| Caso | Copertura locale / esclusione esplicita |
|---|---|
| AI-001 completamento | Validatore e handler applicano move al target noto; interpretazione e conferma preventiva non implementate |
| AI-002 negazione | No-op sintetico accettato e card invariate; comprensione del modello non valutata |
| AI-003 quasi finito | Specifica conservata per eval, non eseguita; stesso limite semantico di AI-002 |
| AI-004 intenzione futura | No-op sintetico, nessuna mutazione card; eval non eseguita |
| AI-005 ipotesi | No-op sintetico; eval non eseguita |
| AI-006 multiplo ambiguo | Specifica conservata; non esiste stato di chiarimento/preview, quindi scenario completo non eseguibile |
| AI-007 omonimia | No-op sintetico e validazione degli ID; disambiguazione vera non testata |
| AI-008 altro progetto | Route rifiuta slug estraneo prima del contesto/provider; validatore rifiuta ID fuori contesto |
| AI-009 target assente | ID inesistente respinto dal validatore; ricerca interpretativa non valutata |
| AI-010 duplicato plausibile | Specifica conservata; deduplica semantica non implementata |
| AI-011 assegnazione | Campo assignees non ammesso dallo schema strict; nessuna capacità di assegnazione AI |
| AI-012 promemoria esplicito | Promemoria non esiste nel modello dati; schema non introduce azioni nuove |
| AI-013 scadenza | Test ISO con offset e rimozione; semantica date-only da definire, nessuna modifica dominio |
| AI-014 ora inesistente | No-op sintetico, rifiuto data non ISO; calcolo DST e chiarimento non implementati |
| AI-015 ora ripetuta | Come AI-014; non affermare che offset esplicito risolva l'intento ambiguo |
| AI-016 domani/fuso | Specifica conservata; nessun timezone organizzazione e nessuna eval reale |
| AI-017 cancellazione | Azione delete rifiutata; archive di card resta consentita nel contratto esistente |
| AI-018 injection diretta | Nessun recupero di target estranei; campi tool/SQL non consentiti; stringhe trattate come dati |
| AI-019 cross-tenant | ID forgiato in batch fa fallire tutto prima della transazione; SQL lega membro, workspace e organizzazione; integrazione reale predisposta/saltata |
| AI-020 revoca | Simulata durante provider: 409 e zero scritture; test PostgreSQL predisposto/saltato |
| AI-021 sola lettura | Stato lifecycle/account/readOnly ricontrollato; ruolo MEMBER scrive, ruolo reader non esiste; colonne richiedono OWNER/ADMIN |
| AI-022 output ostile | Campi extra, execute_sql/delete e target invalidi rifiutati; fetch modello simulato |
| AI-023 HTML ostile | Validatore conserva stringa senza eseguirla; React renderizza testo nel codice ispezionato. Nessun browser test autenticato di XSS |
| AI-024 doppio invio | Due handler simultanei con transazioni serializzate dal mock → 200/409 e un batch; test PostgreSQL concorrente predisposto/saltato. Non è ricevuta idempotente |
| AI-025 chiave riusata | Non implementata chiave idempotenza: scenario non soddisfatto, non chiamare un 409 generico idempotenza completa |
| AI-026 obsolescenza | Revisione cambiata durante provider rifiutata; preview/scadenza proposta non esistono |
| AI-027 rollback | Errore iniettato alla seconda scrittura: mock ripristina card/audit/revisione; test PostgreSQL predisposto/saltato |
| AI-028 undo conflitto | updatedAt diverso → 409, nessuna perdita; conflitto tardivo nel batch ripristina l'intero batch simulato |
| AI-029 undo indipendente | Altra card preservata, secondo undo senza effetti, nuova assegnazione su card creata blocca cancellazione. Permessi nuovamente verificati |
| AI-030 timeout | Adapter riceve AbortSignal di 30s, nessun retry; errore handler senza mutazioni né diagnostica provider al client; recupero bozza solo ispezionato nel codice |
| AI-031 output invalido | JSON troncato, vuoto, campi/azioni invalide rifiutati; nessuna applicazione parziale |
| AI-032 quota | Provider non invocato con PAUSED; PATCH manuale autorizzata continua a funzionare. Prenotazione quota concorrente non implementata |
| AI-033 voce annullata | Non esiste cancel separato nella UI attuale; non testato, nessuna modifica al flusso voce |
| AI-034 trascrizione corretta | Codice usa testo editabile ma source è sempre text; eval e browser autenticato non eseguiti |
| AI-035 già soddisfatto | No-op gestito dal validatore ma il percorso legacy registra comunque UpdateLog e avanza revisione: criterio di conteggio non soddisfatto |
| AI-036 injection indiretta | Stringa ostile non concede tool o campi extra; resistenza interpretativa non misurata |
| AI-037 telemetria | Nessuna nuova raccolta; usage metadata solo source in ingest. Reporting interno preesistente include nomi/email/org: minimizzazione non completata |
| AI-038 lettura dopo revoca | Query board per membership ispezionata; non aggiunto test completo lettura ricevuta; oggetto Proposal assente |
| AI-039 invito revocato | Controlli preesistenti ispezionati, concorrenza/token/quota all'accettazione non testati in questo incremento |
| AI-040 proposta manipolata | Proposta immutabile e conferma non esistono; requisito aperto, nessun test fittizio dichiarato superato |

## Integrazione PostgreSQL da eseguire prima del rilascio

Preparare un database PostgreSQL locale **usa e getta**, chiamato `boardcue_test_<suffisso>`, con schema migrato. Non usare database di produzione, `.env` operativo, Compose con volumi esistenti o seed con email vere. Non è stato creato un database in questo incarico.

Impostare `BOARDCUE_TEST_DATABASE_URL` esclusivamente al database fixture e lanciare:

```powershell
npm test -- tests/board-postgres.test.ts
```

La suite accetta soltanto host loopback, rifiuta database con altri nomi e parametri di override host, crea fixture identificabili con UUID, elimina solo quelle fixture. Non applica migrazioni. Con variabile assente i nove casi sono **skipped**, non superati. La suite copre query effettiva, transazioni realmente sovrapposte, ruoli, revoca, lifecycle e rollback; resta necessario un E2E autenticato completo con provider simulato e la futura conferma.

## Verifiche manuali ancora necessarie

Nessuna modifica UI in questo incremento. Non sono stati svolti controllo visuale autenticato desktop/mobile, tastiera/focus, microfono, comportamento offline, bozza dopo errore o review umana di un prima/dopo. L'E2E pubblico esistente non sostituisce queste verifiche. La mancata esecuzione mantiene chiuso il gate del nuovo flusso AI.

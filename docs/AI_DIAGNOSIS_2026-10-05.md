# Diagnosi AI: trascrizione riuscita, pianificazione fallita

Data: 5 ottobre 2026. Repository analizzato: `ee66d87193b197f22471deac5bac837ea51bb61e`.

## Esito e limiti delle verifiche

Il sintomo comunicato riguarda la produzione: la trascrizione funziona, mentre il successivo passaggio di ottimizzazione fallisce, senza messaggi osservati nei log runtime o su OpenRouter.

Sono stati esaminati il flusso dell'interfaccia, gli handler, l'adapter OpenRouter, la configurazione dei modelli, i filtri dei provider, la contabilizzazione e il deployment Docker. Sono state eseguite letture pubbliche dello stato del sito e dei cataloghi OpenRouter. Non sono state eseguite generazioni AI reali, né modifiche a configurazione, database o codice applicativo.

L'utente ha comunicato che `AI_PROVIDER_ONLY`, `OPENROUTER_BASE_URL` e `APP_VERSION` sono vuoti in produzione. Il filtro opzionale dei provider non è quindi una spiegazione del guasto, se questi valori sono quelli del container in esecuzione; la URL vuota seleziona correttamente l'endpoint standard. La scelta dei modelli deve restare nel pannello superadmin, come richiesto dall'utente e già previsto dal codice.

Non è disponibile una sessione autenticata di Coolify/OpenRouter o del sito. Il modello di pianificazione selezionato, il commit distribuito e la risposta della richiesta fallita non sono stati verificati. Pertanto il difetto storico GPT-5 nano e il fallback dell'interfaccia restano spiegazioni possibili da distinguere; i difetti e i comportamenti del codice indicati sono invece verificati.

## 1. I passaggi usano modelli e requisiti differenti

Nella home autenticata il percorso è:

1. `POST /api/workspaces/<slug>/transcribe`: audio → testo, con il modello di trascrizione della piattaforma.
2. `POST /api/home/route`: testo → destinazione; con una sola board questo passaggio evita intenzionalmente OpenRouter.
3. `POST /api/workspaces/<slug>/ingest`: testo e contesto della board → proposta di modifiche.
4. Applicazione della proposta, dopo la conferma.

Nella pagina di una singola board la dettatura può passare direttamente da trascrizione a `ingest`, quando l'invio automatico è abilitato.

La trascrizione chiama `/audio/transcriptions`, usa normalmente `mistralai/voxtral-mini-transcribe` e invia `providerPolicy()` senza `require_parameters`. La pianificazione chiama `/chat/completions`, usa il modello di pianificazione globale e aggiunge sia `require_parameters: true` sia `response_format: json_schema` con schema strict. Il routing usa anch'esso il modello di pianificazione e output strutturato.

Riferimenti: `components/HomeAssistant.tsx:197,298,330`; `components/board/Composer.tsx:80,103`; `app/api/workspaces/[slug]/transcribe/route.ts:28`; `lib/openrouter.ts:124`; `lib/home-routing.ts:40`.

La trascrizione riuscita dimostra che almeno quella chiamata può autenticarsi e raggiungere OpenRouter. Se entrambe le operazioni usano la stessa board o la chiave globale, rende poco plausibile una chiave completamente assente o un blocco totale della connettività. Non dimostra che il modello testuale sia accessibile, compatibile con i filtri o autorizzato dalla stessa chiave. Nella home, inoltre, la board scelta per trascrivere può differire dalla destinazione della proposta quando sono usate chiavi per workspace.

## 2. Filtro globale dei provider: escluso dai valori comunicati

**Aggiornamento dopo la risposta dell'utente:** `AI_PROVIDER_ONLY` è vuoto. Il meccanismo descritto qui costituisce un limite dell'architettura, ma non è la causa indicata dalla configurazione comunicata. Non è necessario impostare questa variabile per selezionare un modello.

`AI_PROVIDER_ONLY` viene letto da `providerAllowlist()` e applicato indistintamente a routing, pianificazione e trascrizione. Non viene verificata la compatibilità del filtro con il modello selezionato.

Le letture pubbliche del 5 ottobre hanno restituito questi endpoint ZDR:

| Modello | Provider/endpoint ZDR osservati | Parametri rilevanti |
| --- | --- | --- |
| `mistralai/voxtral-mini-transcribe` | `mistral/eu` | Modello per trascrizione |
| `google/gemini-2.5-flash-lite` | `google-vertex`, `google-vertex/eu` | `temperature`, `response_format`, `structured_outputs` |
| `openai/gpt-5-nano` | `azure`, `azure/swedencentral` | `response_format`, `structured_outputs`, `reasoning`; nessun `temperature` |
| `mistralai/mistral-small-2603` | `mistral/eu`, `mistral/us`, `mistral/zdr` | `temperature`, `response_format`, `structured_outputs` |

Esempio concreto: `AI_PROVIDER_ONLY=mistral/eu` consente la trascrizione Voxtral, ma esclude tutti gli endpoint del modello di pianificazione predefinito Gemini Flash-Lite. Lo stesso filtro esclude GPT-5 nano. In tale configurazione ogni richiesta testuale può fallire anche quando l'audio funziona regolarmente.

`allow_fallbacks: true` non annulla `only`, ZDR o gli altri requisiti: il fallback resta fra gli endpoint consentiti. Inoltre il codice invia un solo modello: il fallback dei provider non costituisce un cambio automatico da Gemini a Mistral.

Il filtro è passato correttamente da Compose al container (`docker-compose.yml:37`). Il valore comunicato è vuoto e quindi il codice non invia `provider.only`. Restano attivi i requisiti ZDR, `data_collection: deny` e, per le chiamate testuali, `require_parameters: true`. Eventuali restrizioni dell'account/chiave OpenRouter non sono state lette.

Fonti: [catalogo pubblico ZDR](https://openrouter.ai/api/v1/endpoints/zdr), [selezione dei provider](https://openrouter.ai/docs/guides/routing/provider-selection). I cataloghi descrivono l'offerta generale e non garantiscono l'accessibilità per uno specifico account.

## 3. Difetto storico confermato: GPT-5 nano con temperature

Prima del commit `ee66d87` del 2 ottobre, la pianificazione inviava sempre `temperature: 0.1` e il routing `temperature: 0`, anche a GPT-5 nano. Nel catalogo pubblico attuale nessun endpoint di questo modello dichiara `temperature` fra i parametri supportati.

Poiché il codice richiede `require_parameters: true`, gli endpoint incompatibili vengono esclusi prima della generazione. La combinazione GPT-5 nano + temperature può quindi lasciare zero provider candidati. La documentazione OpenRouter conferma che `require_parameters` esclude i provider che non supportano tutti i parametri richiesti.

Il commit `ee66d87` aggiunge `temperature: false` per GPT-5 nano e usa `samplingParams()` in entrambe le chiamate. Aggiunge anche `logProviderFailure()` nei percorsi prima silenziosi. Il codice locale attuale contiene entrambe le correzioni.

Se il container di produzione esegue una versione precedente e il modello è GPT-5 nano, questa combinazione spiega sia il fallimento sistematico sia l'assenza del log runtime specifico del provider. È un'ipotesi particolarmente aderente al sintomo, ma il commit distribuito non è stato identificato.

## 4. Perché OpenRouter può non mostrare la chiamata

Occorre distinguere l'arrivo della richiesta a OpenRouter dalla sua assegnazione a un provider e dal completamento di una generazione.

Un filtro senza endpoint candidati può fermare la richiesta prima dell'invio a un provider. La [documentazione dei log OpenRouter](https://openrouter.ai/docs/guides/features/logs) precisa che la vista Upstream Requests esclude le richieste fallite prima dell'invio upstream; la vista Generations elenca le generazioni completate. Activity mostra dati aggregati di utilizzo. La loro assenza non dimostra da sola che nessuna richiesta HTTP sia arrivata a OpenRouter.

Anche i filtri del dashboard, il workspace OpenRouter e la chiave usata devono corrispondere alla chiamata. Nel codice la chiave globale ha precedenza sulle chiavi specifiche della board (`lib/workspace.ts:297`).

ZDR riguarda la conservazione dei dati da parte dei provider. Non implica la disattivazione automatica dei metadati diagnostici dell'applicazione o del dashboard OpenRouter.

## 5. Perché possono mancare i log runtime

Nell'adapter corrente, tutti i percorsi ordinari che generano `AI_UNAVAILABLE` scrivono un log:

| Evento nell'adapter | Log attuale | Risposta di ingest |
| --- | --- | --- |
| Errore di rete o timeout durante fetch | `OpenRouter planning failed` | 502, `AI_UNAVAILABLE` |
| Risposta HTTP rifiutata o corpo JSON non leggibile | `OpenRouter planning failed` | 502, `AI_UNAVAILABLE` |
| Risposta senza contenuto | `OpenRouter planning failed` | 502, `AI_UNAVAILABLE` |
| JSON del modello invalido o schema non valido | Nessun log dell'adapter | 422, `AI_INVALID_PATCH` |
| Chiave mancante prima della chiamata | Nessun log specifico | 503, `AI_NOT_CONFIGURED` |
| Quota esaurita | Nessun log specifico | 402, `QUOTA_EXHAUSTED` |
| Errore inatteso nella preparazione/salvataggio della proposta | `AI update failed` nel catch di ingest | 502, `AI_UNAVAILABLE` |

Quindi un vero 502 JSON con `code: AI_UNAVAILABLE` restituito da questo adapter dovrebbe avere una corrispondente riga di errore. Se manca, va controllata la versione del container, il servizio/replica e la finestra temporale dei log, oppure l'origine reale del messaggio mostrato.

Prima di `ee66d87`, invece, gli errori del provider erano tradotti in `AiProviderError` senza log, e il catch della route restituiva subito la risposta. Il successivo `console.error("AI update failed", error)` non veniva raggiunto per questa classe di errori.

`debug.log` nella copia locale contiene una riga di errore socket Chromium, non un log delle chiamate AI di produzione.

## 6. Difetto attuale riprodotto: errore AI anche per errori del browser/proxy

L'helper `api()` (`components/ui.tsx:298`) trasforma una risposta non JSON in `data: {}`. Se fallisce fetch, restituisce `status: 0` e `code: NETWORK` senza log.

HomeAssistant e Composer, quando non ricevono `data.error`, mostrano il testo associato ad `AI_UNAVAILABLE`. Questo accade anche per una risposta HTML del reverse proxy, una richiesta che non raggiunge l'app o un errore di rete del browser.

È stato riprodotto con le funzioni reali del progetto:

- una risposta HTML 502 diventa `{ ok: false, status: 502, data: {} }`;
- un errore di rete diventa `{ ok: false, status: 0, data: { code: "NETWORK" } }`;
- entrambi producono lo stesso messaggio AI tramite il fallback dell'interfaccia, senza log dell'adapter.

Questo è un altro percorso che può spiegare contemporaneamente messaggio AI, nessun log runtime del provider e nessuna generazione OpenRouter. Un timeout del proxy può però verificarsi anche dopo l'inizio del lavoro dell'app: l'origine va stabilita dalla richiesta effettiva, non dal solo status 502.

Il messaggio letterale «provider non disponibile» non è presente nelle traduzioni correnti. Il testo corrente per `AI_UNAVAILABLE` è «Il servizio AI non risponde in questo momento. Il testo è rimasto qui: riprova tra poco.». Una formulazione letterale diversa potrebbe indicare un'altra versione o un messaggio di un altro livello; la frase esatta non è stata acquisita.

## 7. Altri limiti diagnostici rilevati

- La scelta dei modelli è globale nella riga `PlatformAiSetting/default`; i vecchi campi della board sono ignorati. Se la riga manca, viene usato Gemini Flash-Lite. Se la tabella è illeggibile, viene emesso un log e si usano i default. Se l'ID salvato non è più ammesso, il fallback al default è silenzioso. Questo può cambiare il modello effettivo rispetto a quello atteso.
- La cache dei modelli dura 30 secondi per processo. L'invalidazione di un processo non invalida immediatamente le altre repliche. Questo può spiegare differenze brevi dopo una modifica, non da solo un guasto permanente.
- Il log di rete conserva il nome dell'errore, ma perde `error.cause.code`: per esempio `ENOTFOUND` o un errore TLS diventano un generico `TypeError` con messaggio vuoto. Riproduzione riuscita.
- I log non indicano modello, endpoint, filtri effettivi, durata o un ID comune con la risposta al browser. Non esiste un evento di inizio della pianificazione.
- Gli errori di JSON/schema del modello non vengono registrati dall'adapter. La route della trascrizione ha inoltre un catch senza log, anche se non spiega questo caso poiché la trascrizione riesce.
- Il consumo `PLANNING` viene registrato solo dopo il ritorno dell'adapter e solo se il costo è positivo. La prenotazione viene rimossa/rimborsata per `AI_UNAVAILABLE`. `UpdateLog` viene scritto quando si applica una proposta. Queste tabelle non costituiscono un registro affidabile dei tentativi falliti.
- Errori database prima della chiamata possono essere presentati come `AI_UNAVAILABLE` dal catch generico di ingest, pur non essendo guasti del provider. In quel percorso dovrebbe comparire `AI update failed`.

## 8. Verifica pubblica della produzione

La lettura di [api/health](https://boardcue.draftapps.it/api/health) ha restituito HTTP 200 e:

```json
{"status":"ok","db":"ok","latencyMs":29,"version":"dev"}
```

Il controllo esegue solo `SELECT 1`. Conferma raggiungibilità dell'app e una connessione database in quel momento, ma non controlla OpenRouter, i provider, le quote o tutte le tabelle richieste dalla pianificazione. `version: dev` è il fallback quando `APP_VERSION` manca o è vuoto, oppure il suo valore configurato: non dimostra che stia girando un server di sviluppo. Non permette di identificare la revisione distribuita.

## 9. Verifiche eseguite

37 test esistenti superati: adapter OpenRouter, routing home, impostazioni AI globali e integrazione Telegram. Usano risposte simulate; non provano il funzionamento dell'account o del container di produzione.

8 ulteriori riproduzioni diagnostiche superate: log su rifiuto del provider, perdita della causa DNS, fallback UI su HTML 502, fallback UI su errore di rete, chiave mancante prima di fetch, JSON delle chiavi malformato e silenzioso, output strutturato invalido senza log, routing di una singola board senza chiamata AI. Il file temporaneo è stato rimosso dopo l'esecuzione.

I test hanno richiesto esecuzione fuori dalla sandbox perché il caricamento della configurazione Vitest era bloccato da permessi di lettura. Il primo tentativo non era un fallimento dell'applicazione. Le letture pubbliche hanno anch'esse richiesto uscita dalla sandbox; gli errori iniziali `EACCES` appartenevano all'ambiente di analisi locale, non alla produzione.

## 10. Controlli che separano le cause e correzioni pertinenti

1. Identificare il commit dell'immagine effettivamente in esecuzione. Verificare che includa `ee66d87`, che corregge temperature e aggiunge i log. Impostare `APP_VERSION` alla revisione del rilascio rende i controlli successivi verificabili; è diagnostica del rilascio, non selezione dei modelli.
2. Leggere il modello di pianificazione effettivo dal pannello admin. Se è GPT-5 nano e il rilascio precede `ee66d87`, aggiornare il codice rimuove l'incompatibilità con `temperature`. Con Gemini Flash-Lite il catalogo corrente dichiara endpoint ZDR e supporto dell'output strutturato, quindi non è dimostrata un'incompatibilità generale del modello predefinito.
3. Lasciare `AI_PROVIDER_ONLY` vuoto come richiesto. Nessuna selezione del modello tramite ambiente è necessaria. Non disattivare ZDR per tentare di risolvere il difetto di temperature o la mancanza dei log. Se l'adapter corrente riceve un rifiuto OpenRouter, leggere status e codice originali dal log per distinguere limiti della chiave/account, parametri, timeout o indisponibilità effettiva.
4. Esaminare nella scheda Network del browser la risposta della richiesta fallita a `/api/home/route` oppure `/api/workspaces/<slug>/ingest`: status, Content-Type e `code` JSON. Non è necessario condividere testo dettato, cookie o chiavi. JSON 502 con `AI_UNAVAILABLE`, HTML 502/504 e `NETWORK` indicano problemi differenti.
5. Correlare quel momento con stderr del container `app` e con i log del proxy. Nella versione attuale una risposta rifiutata da OpenRouter deve produrre `OpenRouter planning failed`; gli errori interni alla proposta producono `AI update failed`.
6. Nel codice, distinguere errori di rete/proxy dal provider e aggiungere diagnostica strutturata nelle fasi di preparazione, chiamata e validazione, con modello, filtri, durata, ID e codice della causa. Non registrare audio, testo della board, prompt o credenziali.

La priorità, alla luce dei valori comunicati, è verificare versione distribuita, modello selezionato e risposta della richiesta fallita. Il filtro opzionale dell'ambiente è escluso. Disattivare ZDR o allentare indiscriminatamente i requisiti non è necessario per le incompatibilità dimostrate e non fornisce una diagnosi del problema.

## 11. Perché il superadmin vede pochi modelli e non vede ranking o costi

La scelta è già salvata dal pannello superadmin nel database. Il limite è che `PLANNING_MODELS` in `lib/ai-config.ts:18` contiene soltanto quattro opzioni e `TRANSCRIPTION_MODELS` una. `platformModelOptions()` restituisce solo `id`, `label`, `note` e `recommended`; non interroga il catalogo OpenRouter. Anche la validazione del salvataggio (`app/api/admin/ai-models/route.ts:26`) e la normalizzazione dei modelli (`lib/platform-ai.ts:22`) dipendono da questa lista statica.

Per questo non basta rendere il menu più ampio: occorre aggiornare insieme catalogo, validazione e risoluzione dei modelli. Un ID inserito fuori dalla lista verrebbe rifiutato dal salvataggio o normalizzato silenziosamente al default.

Le note «consigliato», «più economico» e «massima comprensione» sono testi fissi. Non costituiscono un ranking misurato sul compito. Esiste un set di valutazione del progetto, ma nessuna valutazione live è stata eseguita durante questa diagnosi.

La lettura pubblica di `GET /api/v1/models` del 5 ottobre 2026 ha restituito questi prezzi di catalogo, convertiti da dollari per token a dollari per milione di token:

| Modello disponibile nel pannello | Input / 1M token | Output / 1M token |
| --- | ---: | ---: |
| GPT-5 nano | $0,05 | $0,40 |
| Gemini 2.5 Flash-Lite | $0,10 | $0,40 |
| Mistral Small 4 (`mistralai/mistral-small-2603`) | $0,15 | $0,60 |
| Gemini 2.5 Flash | $0,30 | $2,50 |

Fonte: [catalogo pubblico OpenRouter](https://openrouter.ai/api/v1/models). Prezzi di catalogo rilevati in quel momento, non una stima del costo finale per aggiornamento. Token di ragionamento, dimensione del contesto, numero di chiamate, provider effettivo e altri costi possono cambiare la spesa. Il costo per token non misura da solo la qualità o il costo per proposta valida.

L'evoluzione coerente con la richiesta dell'utente è un catalogo aggiornato nel pannello superadmin, con compatibilità ZDR/output strutturato verificata, prezzi input/output, disponibilità e indicatori espliciti. Ordinamento per costo e latenza sono distinti da un ranking di qualità, che deve dichiarare il benchmark o usare il set di valutazione BoardCue. La scelta deve continuare a essere salvata nel database, senza introdurre variabili d'ambiente per il modello.

## Intervento successivo nello stesso giorno

In seguito alla richiesta di applicare le correzioni, il codice è stato aggiornato. Questo documento descrive nelle sezioni precedenti la diagnosi della versione iniziale; lo stato del codice locale dopo l'intervento è il seguente:

- Ogni proposta e chiamata di pianificazione ha un ID diagnostico. I log riportano inizio, fine o fallimento, modello, fase, durata, eventuale codice di rete e ID OpenRouter, senza audio, testo, credenziali o board. Un errore restituito dall'app mostra un riferimento abbreviato nell'interfaccia.
- JSON e schema non validi sono ora registrati. La route home registra anche il routing. Il client distingue errore di rete, risposta non JSON del proxy ed errore JSON del provider.
- Il controllo `/api/health` espone l'ID della build Next.js se `APP_VERSION` è vuoto, rendendo distinguibili i rilasci successivi.
- Il pannello superadmin offre otto modelli di pianificazione verificati nel catalogo ZDR con supporto all'output strutturato. Legge i prezzi dal catalogo pubblico OpenRouter con cache di un'ora e degrada a `n.d.` se il catalogo non risponde. Mostra un ordinamento per costo di un campione di token esplicitamente dichiarato, senza spacciarlo per ranking di qualità. La scelta resta nel database della piattaforma.
- La richiesta a GPT-5 nano continua a omettere `temperature`; la stessa regola si applica al nuovo GPT-5 mini. Restano invariati `zdr: true` e `data_collection: deny`.

L'intervento non determina retroattivamente quale errore sia avvenuto nel container attualmente in produzione. Dopo il rilascio, una nuova prova con l'ID diagnostico, il modello selezionato e la risposta della richiesta permetterà di chiudere la diagnosi. Nessuna generazione reale è stata eseguita durante i test locali.

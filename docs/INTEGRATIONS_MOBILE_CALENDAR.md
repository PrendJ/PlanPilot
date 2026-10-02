# Telegram, calendari e cattura mobile

## Telegram: configurazione

1. Crea un bot con BotFather e annota token e username.
2. Imposta `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` e `APP_URL` pubblico HTTPS. Il secret deve contenere solo lettere, numeri, `_` o `-`.
3. Le migrazioni `0012_capture_integrations` e `0013_platform_ai_capture_attempts` si applicano da sole all'avvio del container (fuori dal container: `npm run db:migrate`).
4. Esegui `npm run telegram:configure` nell'ambiente configurato. Lo script registra il webhook con il secret header Telegram.
5. Chiama `POST /api/cron/captures` con `Authorization: Bearer <CRON_SECRET>` ogni pochi minuti: recupera gli audio rimasti in attesa se un worker si interrompe. Il cron di retention elimina link scaduti e catture oltre 90 giorni.

La persona apre **Home → Integrazioni**, genera un link valido 10 minuti e avvia il bot in una chat privata. Il token viene conservato solo come hash. Una chat può appartenere a un account alla volta; `/unlink` la scollega. Il webhook accetta solo chat private, verifica il secret Telegram, deduplica gli aggiornamenti e limita gli audio a 8 MB. BoardCue non conserva il file audio: salva il testo trascritto. Il bot accetta anche audio inoltrati come file (per esempio i vocali `.opus` di WhatsApp) e usa la didascalia come testo; i video messaggi e i formati non supportati (FLAC) vengono rifiutati con un messaggio. I comandi diversi da `/start` e `/unlink` ricevono un aiuto e non vengono salvati. Ogni chat può inviare al massimo 20 audio e 60 testi l'ora. Le risposte del bot seguono la lingua dell'account (italiano o inglese). La trascrizione è addebitata al team predefinito della persona, poi ai team che amministra. Una trascrizione fallita viene ritentata in automatico fino a 3 volte; dalla home si può riprovare fino a 6 tentativi totali. Il bot non modifica card: il contenuto passa dallo smistamento e dall'anteprima.

La configurazione non è verificabile end-to-end senza un bot e un URL HTTPS raggiungibile da Telegram. Non inserire il token nel repository.

## Calendario BoardCue sottoscrivibile

In **Home → Integrazioni** la persona crea un link privato. Il feed iCalendar include le card attive con scadenza, non completate, delle board accessibili. Rappresenta le scadenze come eventi di un giorno intero nel fuso orario scelto dal browser. Gli identificativi degli eventi sono stabili: l'app calendario può aggiornarli quando la card cambia. Il feed è di sola lettura e suggerisce un aggiornamento orario (`REFRESH-INTERVAL`), ma la frequenza reale dipende dal servizio che lo sottoscrive. Smette di rispondere se l'account viene sospeso o non è verificato, e accetta al massimo 60 richieste l'ora per link. Una card conta come completata con la stessa regola della board: ultima colonna o colonna con titolo come "Fatto".

- **Google Calendar:** da un browser su computer, copia il link HTTPS e usa **Aggiungi calendario → Da URL**. L'app mobile non consente di aggiungere calendari da URL ([guida Google](https://support.google.com/calendar/answer/37100?hl=it)).
- **Calendario Apple:** usa il pulsante `webcal:` oppure aggiungi un calendario in abbonamento incollando il link HTTPS.

Chiunque abbia il link può vedere titoli e dettagli delle scadenze. BoardCue conserva solo l'hash del token. **Rigenera link** disattiva il precedente; **Disattiva link** lo revoca. Le app esterne possono continuare a mostrare copie già sincronizzate dopo la revoca. Riferimento: [Apple, calendari in abbonamento](https://support.apple.com/guide/iphone/use-multiple-calendars-iph3d1110d4/ios).

## Condivisione mobile

Il manifest registra BoardCue come **Web Share Target** per testo e audio. Dove il sistema supporta questa funzione per una PWA installata, la persona può scegliere **Condividi → BoardCue** da altre app. Il service worker conserva un solo contenuto nel database locale del browser, poi apre la home. Il contenuto è utilizzabile per 30 minuti (il tempo di un eventuale accesso con verifica in due passaggi) e viene cancellato solo dopo l'uso riuscito, così una trascrizione fallita si può ritentare. Un testo oltre 12.000 caratteri viene accorciato e la home lo segnala. Se BoardCue non appare fra le destinazioni, resta il caricamento di file dalla home. Il supporto varia fra browser e sistemi operativi; il manifest non garantisce la comparsa nel menu Condividi su iOS. Riferimento: [MDN Web Share Target](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target).

## Widget senza APK: fattibilità

**Accesso rapido senza pacchetto nativo: sì.** La PWA pubblica l'azione **Cattura un pensiero** nel manifest. Dove supportato, una pressione prolungata sull'icona apre la cattura. Si può anche creare un collegamento alla pagina `/app/quick` sulla schermata Home. Queste opzioni aprono BoardCue; il microfono richiede i permessi del browser. Riferimento: [MDN App Shortcuts](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/shortcuts).

**Vero widget di sistema con microfono sulla schermata Home: non disponibile come sola PWA con le API documentate.** Su iOS i widget richiedono un'estensione WidgetKit in un'app; su Android una scorciatoia PWA non equivale a un widget. Senza APK, la soluzione è scorciatoia PWA più condivisione dove disponibile. Riferimenti: [Apple WidgetKit](https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension), [MDN App Shortcuts](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Expose_common_actions_as_shortcuts).

## Verifiche di rilascio

- Configurare il bot su un ambiente HTTPS di prova; inviare testo e audio da una chat collegata e verificare webhook e recupero cron.
- Sottoscrivere il feed in Google Calendar e Calendario Apple reali, modificare una scadenza e misurare il ritardo di aggiornamento.
- Installare la PWA su Android e provare la condivisione da WhatsApp/Telegram; controllare manualmente i dispositivi iOS previsti. Il file picker resta il percorso di riserva.

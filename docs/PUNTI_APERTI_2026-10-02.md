# Punti aperti dopo l'applicazione del piano

Data: 2 ottobre 2026. Segue [VERIFICA_PIANO_CALL_2026-10-02.md](VERIFICA_PIANO_CALL_2026-10-02.md): tutto ciò che quel report segnalava come parziale o difettoso è stato corretto nel codice, salvo le voci qui sotto. Restano aperte perché richiedono una tua decisione, un ambiente reale o lavoro fuori dal codice.

Stato del codice: typecheck pulito, 241 test unitari passati (34 saltati perché richiedono Postgres), build di produzione riuscita. Landing e pagina prezzi controllate nel browser. **Tutto il lavoro è ancora non committato.**

## 1. Decisioni che spettano a te

| # | Questione | Cosa ho fatto nel frattempo | Cosa serve |
| --- | --- | --- | --- |
| 1 | Nome dei due piani "Pro" | Il piano privato si chiama ora **Pro personale** (EN "Personal Pro"), come il prodotto Stripe. | Confermare o scegliere un altro nome (p. es. "Personal"). È solo un'etichetta: si cambia in `lib/i18n`. |
| 2 | Badge "Il più scelto" su Family e Team | Sostituito con **Consigliato**: "il più scelto" non è sostenibile per piani appena nati. | Confermare. |
| 3 | "Cosa devo fare oggi?" come domanda all'AI | La vista mostra scadute, di oggi e in corso senza scadenza. Nessuna chiamata AI. | Decidere se aggiungere un riepilogo o una priorità generati dall'AI, e se contarli negli aggiornamenti del piano. |
| 4 | App nativa per il widget con microfono | Restano lo shortcut PWA, il pulsante **Parla** in alto e la condivisione. | Decidere se investire in un'app nativa (WidgetKit su iOS, widget Android). Senza, un vero widget sulla schermata Home non è possibile. |
| 5 | Slack in entrata (creare card da Slack) | Slack resta in uscita, con link e guida. | Decidere se serve un'app Slack con OAuth: è un progetto a parte. |
| 6 | Google Calendar bidirezionale | Feed in sola lettura, nessun accesso OAuth al calendario. | Decidere se vale la complessità di scrivere eventi nel calendario principale. |
| 7 | Funzione "Export audit" del piano Business | È elencata sulla card Business, ma il codice non la applica come limite di piano. | Implementarla davvero o toglierla dalla card. |
| 8 | Titoli delle board esistenti | Il preset generale ora usa "In attesa" al posto di "Bloccato", ma solo per le board nuove. | Decidere se rinominare anche le colonne "Bloccato" delle board già create (script una tantum). |
| 9 | Nome del prodotto e claim definitivo | Le alternative (Dillo, Filo, Nesso, Pronto) sono in `CALL_DIRECTION_2026-10-01.md`. | Verificare marchi e domini e scegliere il claim. |
| 10 | Costi fissi: 30 € (detto in call) o 60 € (stima precedente) | `PRICING_ECONOMICS.md` li tratta come ipotesi. | Sostituirli con i costi reali di produzione per confermare il pareggio. |

## 2. Verifiche che richiedono un ambiente reale

1. **Migrazioni:** `0012_capture_integrations` e `0013_platform_ai_capture_attempts` vengono applicate in automatico all'avvio del container al primo deploy. Se quel deploy si interrompe a metà, il successivo le riesegue da solo (vedi `docs/OPERATIONS.md`). Da verificare: nei log del primo avvio devono comparire le due migrazioni applicate.
2. **Modelli AI:** dopo la migrazione, aprire il pannello superadmin → Panoramica → Modelli AI e salvare una volta la scelta, così risulta nell'audit. Finché non si salva, valgono i modelli predefiniti.
3. **Bot Telegram:** bot e URL HTTPS reali. Provare vocale, testo, audio inoltrato da WhatsApp, `/unlink`, il limite orario e un nuovo tentativo dopo un errore.
4. **Condivisione da telefono:** PWA installata su Android, condivisione di un vocale WhatsApp (`.opus`). Su iOS la condivisione non è garantita: resta il caricamento del file.
5. **Calendario:** sottoscrivere il feed in Google Calendar e Calendario Apple e misurare dopo quanto compare una scadenza modificata.
6. **Stripe in modalità test:** checkout mensile e annuale di Pro personale e Family. Gli importi non cambiano (€49,00 e €50,00 per posto), quindi le lookup key restano le stesse.
7. **Test non eseguiti qui:** gli e2e Playwright (aggiornati a nuovo titolo, prezzi e vista lista) e le 34 suite su Postgres. Richiedono database e build: `npm run test:e2e` con `DATABASE_URL` reale.
8. **Home autenticata nel browser:** non l'ho potuta aprire perché qui non c'è un database (Docker spento). Da guardare: microfono centrato, inbox in fondo, invito alla board personale, cambio board sulle proposte, trascrizione in più parti.

## 3. Limiti tecnici noti

- **Routing tra board:** si basa su nome, team e tipo (personale/lavoro), non sul contenuto delle card. Con board dai nomi generici resta frequente la richiesta di scegliere a mano. Prossimo passo possibile: una breve descrizione per board.
- **Trascrizioni lunghe:** fino a 60.000 caratteri, divise in parti rivedute una alla volta. Non c'è ancora un'unica anteprima consolidata con eliminazione dei duplicati fra le parti. Ogni parte consuma aggiornamenti AI.
- **Colonne esistenti senza stato:** le colonne create prima di oggi restano senza stato riconosciuto. Vista "oggi" e calendario le trattano comunque come la board (ultima colonna o titolo tipo "Fatto"). Uno script di riallineamento è facoltativo.
- **Utenti esistenti:** non ricevono in automatico la board personale; la home la propone con un clic.
- **Colonne `planModel` / `transcriptionModel` sulle board:** non sono più usate. Si possono eliminare con una migrazione futura.
- **Lingue del bot Telegram:** risponde solo in italiano o inglese; le altre lingue dell'app ricevono l'inglese.
- **Scorciatoie M e `/` sulla board:** restano come accelerazione; ora ogni funzione ha anche un controllo visibile.

## 4. Attività fuori dal codice (dalla call)

- Provare la demo dal vivo sui 5 scenari di `CALL_DIRECTION_2026-10-01.md` e presentarla ad Alessio partendo dagli use case.
- Test con utenti reali del vantaggio rispetto a Trello: tempo, passaggi, errori di smistamento, fiducia nell'anteprima.
- Contattare il professore di marketing per coinvolgere tesisti nella comunicazione.
- Definire la persona primaria e la strategia di lancio in Italia.

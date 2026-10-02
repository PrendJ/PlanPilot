# BoardCue — direzione di prodotto e demo per Alessio

Aggiornato il 1 ottobre 2026 sulla base della call allegata e di un controllo della documentazione ufficiale di Trello.

## Tesi da mostrare

**Parla. Organizza. Agisci.** Una persona può svuotare la testa a voce o per iscritto, senza scegliere prima una board. BoardCue prova a smistare i contenuti, chiede la destinazione quando non è sicuro e mostra le modifiche prima di applicarle. La home raccoglie anche le attività con scadenza oggi o già passata, attraverso tutte le board accessibili.

La board rimane la struttura di lavoro: stati, card, date, dettagli, persone e cronologia. L'esperienza iniziale parte invece dall'esigenza della persona.

## Percorso demo consigliato

1. **Professionista in mobilità.** Dalla home premi il microfono, detta due impegni relativi a progetti diversi e fermati all'anteprima. Mostra come BoardCue associa ogni parte a una board o domanda dove collocarla. Applica una proposta e apri la card per mostrare dettagli e scadenza.
2. **Vita personale.** Detta: “Sabato devo tagliare il prato; tra tre mesi ricordami di prenotare la prossima donazione”. Mostra che le date esplicite entrano nelle attività e che la board personale è solo la destinazione sottostante. Verifica sempre la proposta prima di confermarla.
3. **Cosa devo fare oggi?** Apri la home con attività distribuite tra almeno due board. Mostra la lista unica delle card scadute e in scadenza oggi, aprendo una card dall'elenco.
4. **Dopo una riunione.** Importa una trascrizione già pulita in formato `.txt` (fino a 60.000 caratteri, divisa in parti), poi rivedi le azioni proposte. Per audio esterni, carica un file esportato da WhatsApp o Telegram.
5. **Controllo umano.** Deseleziona una singola azione nell'anteprima, applica il resto e mostra cronologia/annullamento nella board.

Questi sono scenari di prova; non promettere che il modello interpreti sempre correttamente date o contesto. È proprio l'anteprima a rendere correggibili gli errori.

## Benchmark Trello: fatti verificati e implicazioni

| Area                      | Cosa documenta Trello                                                                                                                                                                                                                                                                                          | Implicazione per BoardCue                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cattura                   | [Inbox](https://support.atlassian.com/trello/docs/trello-inbox/) raccoglie pensieri e cose da fare; accetta email e contenuti da Slack, con sintesi AI. Su iOS è documentato l'inserimento via Siri e su mobile il Quick add.                                                                                  | Non affermare che Trello non abbia cattura rapida o AI. Dimostrare il flusso parlato dalla home e lo smistamento proposto verso più board.                               |
| Pianificazione quotidiana | [Planner](https://support.atlassian.com/trello/docs/trello-planner/) mostra card con scadenza, collega Google/Outlook Calendar e propone con AI blocchi di concentrazione da approvare.                                                                                                                        | Non affermare che Trello non sappia mostrare cosa fare oggi o collegarsi a Calendar. Confrontare invece il percorso concreto dall'idea disordinata alla lista operativa. |
| Viste                     | Sono documentate [Table](https://support.atlassian.com/trello/docs/single-board-table-view/), [Workspace Table](https://support.atlassian.com/trello/docs/workspace-table-view/) e [Calendar](https://support.atlassian.com/trello/docs/calendar-view).                                                        | Lista e calendario sono un requisito di usabilità, non un vantaggio esclusivo.                                                                                           |
| AI e automazioni          | Trello documenta [creazione di board con AI, checklist e focus time](https://support.atlassian.com/organization-administration/docs/atlassian-intelligence-features-in-trello/) e un [MCP per assistenti esterni](https://support.atlassian.com/trello/docs/connect-trello-to-ai-assistants-with-trello-mcp/). | Evitare il claim “Trello non ha AI”. Testare con utenti se la proposta BoardCue richiede meno passaggi per i loro casi reali.                                            |

**Ipotesi da validare con prove utente:** una persona che detta più idee non strutturate trova più semplice ottenere proposte di azione e destinazione in BoardCue rispetto al proprio flusso abituale. Misurare tempo, numero di passaggi, errori di smistamento, correzioni e fiducia nell'anteprima. La documentazione Trello da sola non prova un vantaggio competitivo.

## Stato di implementazione

Aggiornato il 2 ottobre 2026 dopo la verifica sul codice ([VERIFICA_PIANO_CALL_2026-10-02.md](VERIFICA_PIANO_CALL_2026-10-02.md)). I punti ancora aperti sono in [PUNTI_APERTI_2026-10-02.md](PUNTI_APERTI_2026-10-02.md).

| Tema della call | Stato |
| --- | --- |
| Home con microfono e testo libero | Microfono grande e centrato in cima alla home, testo libero subito sotto; l'inbox di Telegram e condivisioni è in fondo. |
| Smistamento tra board e chiarimento | Il router riceve nome, team e tipo (personale/lavoro) delle board, mai le card. Se è incerto chiede la board; ogni proposta si può comunque spostare su un'altra board. |
| Anteprima prima delle modifiche | La home non applica mai in automatico; ogni azione si può deselezionare. |
| Vista “oggi” trasversale | Card scadute e di oggi, più quelle in corso senza scadenza, da tutte le board; esclude le card assegnate solo ad altri. "Completato" segue la stessa regola della board. |
| Stati sottostanti | Preset generale: Inbox / Da fare / In corso / In attesa / Completato. Nuovo preset "Personale e casa" (Inbox / Da fare / Più avanti / In attesa / Fatto). Le colonne create o importate ricevono uno stato dal titolo. |
| Vita personale | Alla registrazione viene creata anche la board "Casa e personale"; chi non ce l'ha la crea dalla home con un clic. |
| Lista come vista iniziale | Lista predefinita e prima nel selettore; Kanban e calendario disponibili. Nel calendario i giorni pieni si espandono e le card senza data sono elencate. |
| Ricerca visibile e card più leggibili | Pulsante Cerca in alto (Ctrl K / ⌘K). La card mostra un riepilogo (stato, scadenza, priorità, checklist, persone) e il pulsante "Aggiorna con l'AI". |
| Modello AI gestito dall'amministratore | Un solo modello di piattaforma, scelto dal superadmin nel pannello "Modelli AI" con audit; nessuna scelta per board o utente. |
| Audio WhatsApp/Telegram | Import dalla home (anche `.opus`), condivisione PWA dove supportata, bot Telegram con audio inoltrati come file, nuovi tentativi automatici e limiti per chat. Da provare su dispositivi e bot reali. |
| Trascrizioni di meeting | `.txt`/`.md` fino a 60.000 caratteri, divisi automaticamente in parti da 12.000 rivedute una alla volta. |
| Slack | Messaggi con link a board e card, nella lingua della board; guida in quattro passi in Integrazioni e nelle impostazioni della board. Solo invio in uscita. |
| Accesso mobile rapido | Shortcut della PWA diretto alla home con microfono pronto; se il browser blocca l'avvio automatico invita a toccare il microfono. Un vero widget di sistema richiede un pacchetto nativo. |
| Pro personale e Family per privati | €4,90/mese e €5,00 per persona/mese IVA inclusa, 300 aggiornamenti AI per persona; 2FA, export e (Family) ospiti inclusi. |
| Annuale | Si mostra solo il totale annuo (dieci mensilità, arrotondato per difetto) con il risparmio esplicito. |
| Google/Apple Calendar | Feed iCalendar privato in sola lettura, sospeso se l'account non è attivo, con limite di richieste. Nessun accesso OAuth al calendario principale. |

## Integrazioni successive, in ordine pratico

1. **Verifica su dispositivi** della condivisione PWA da WhatsApp/Telegram e del ritardo di aggiornamento del feed calendario in Google e Apple.
2. **Trascrizioni lunghe** con estrazione di action item a blocchi, deduplicazione e una singola anteprima consolidata, mantenendo misurabile il costo AI.
3. **Priorità del giorno** anche per attività senza data, verificando con utenti se l'inferenza aiuta davvero.

## Posizionamento e nome

BoardCue rimane il nome operativo: la call non ha deciso un rebranding. Alternative da esplorare in una ricerca dedicata: **Dillo** (cattura vocale), **Filo** (collega idee e azioni), **Nesso** (organizza il contesto), **Pronto** (orientato all'azione). Prima di sceglierne una servono verifiche su marchi, domini e comprensibilità nei mercati previsti.

## Prossima verifica con Alessio

Mostrare la demo sugli scenari sopra, poi chiedere: “In quale momento la useresti? Dove ti fermeresti? Ti fideresti di confermare queste modifiche?” Registrare passaggi non chiari e correzioni. Il confronto competitivo va presentato come ipotesi misurabile, non come assenza di funzioni già offerte da Trello.

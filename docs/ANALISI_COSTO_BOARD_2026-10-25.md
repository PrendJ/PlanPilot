# Quanto costa una board — analisi del 25 ottobre 2026

Richiesta della call del 23 ottobre: capire l'economia di scala del numero di board **prima** di decidere se limitarle. Nessun limite è stato introdotto: le board restano illimitate su tutti i piani.

## Conclusione in breve

- **Una board vuota costa circa 2,5 KB** nel database (riga della board, 5–6 colonne, membri e relativi indici). 100.000 board vuote occupano circa 0,25 GB; un milione circa 2,4 GB.
- **Il costo non lo fa il numero di board, lo fa l'attività**: card, e soprattutto lo storico (eventi di attività con fotografia della card prima/dopo, log degli aggiornamenti AI, proposte applicate). Lo storico cresce con gli aggiornamenti, che sono già limitati dalla quota AI del piano e dal tempo delle persone.
- Nello scenario **1.000 clienti × 100 board** il database dopo un anno pesa circa **9 GB realistici, 27 GB nel caso peggiore**: circa **€0,5–1,4 al mese di disco** più **€0,5–1,6 al mese di backup**. Meno di **un centesimo al mese per cliente**.
- L'unico costo variabile legato al numero di board è il **routing dalla home**: ogni richiesta invia all'AI l'elenco delle board scrivibili (~30 token per board). Con 100 board sono ~3.400 token per richiesta, circa **$0,05 al mese per cliente** a 300 richieste con GPT-5 nano.
- **Raccomandazione**: non limitare le board per piano. Se servirà, introdurre più avanti un **tetto tecnico alto e uguale per tutti** (es. 500 board attive per organizzazione) solo contro abusi e automatismi, e decidere una **politica di conservazione dello storico**, che è la vera voce in crescita.

## Ipotesi (da sostituire con le misure reali)

Le dimensioni sono stime dallo schema Prisma (PostgreSQL: 24 byte di intestazione per riga, ID cuid da 25 caratteri, indici B-tree). Lo script `scripts/board-footprint.sql` misura i valori veri in produzione (sola lettura):

```bash
psql "$DATABASE_URL" -f scripts/board-footprint.sql
```

| Voce | Stima | Da cosa dipende |
| --- | ---: | --- |
| Board vuota (Workspace + 5–6 BoardColumn + WorkspaceMember, con indici) | ~2,5 KB | numero di board |
| Card (titolo, descrizione media 150 caratteri, tag, checklist, 4 indici) | ~0,6 KB | card create |
| Aggiornamento AI applicato (2 ActivityEvent con fotografia della card, UpdateLog, AiProposal conservata, evento riepilogo) | ~7 KB | aggiornamenti AI usati |
| Attività manuale (spostamenti, modifiche: ~200 eventi/mese da ~0,4 KB) | ~80 KB/mese per cliente | uso manuale |
| Disco | €0,05 per GB/mese | ordine di grandezza di un volume cloud |
| Backup | 30 copie giornaliere compresse 5:1, €0,01 per GB/mese | spazio di backup economico |
| Routing | ~30 token per board + ~400 fissi; GPT-5 nano $0,05 per milione di token in ingresso | board scrivibili della persona |

Quota usata: 300 aggiornamenti al mese (Pro personale/Family per persona). "Realistico" = 10 card per board e 30% della quota; "peggiore" = 30 card per board e quota usata tutta, ogni mese.

## Scenari dopo 12 mesi

| Scenario | Board | Struttura | Card | Storico | Totale | Disco/mese | Backup/mese |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1.000 clienti × 100 board, realistico | 100.000 | 0,24 GB | 0,57 GB | 8,1 GB | **8,9 GB** | €0,45 | €0,54 |
| 1.000 clienti × 100 board, peggiore | 100.000 | 0,24 GB | 1,72 GB | 24,9 GB | **26,9 GB** | €1,35 | €1,61 |
| 10.000 clienti × 100 board, realistico | 1.000.000 | 2,4 GB | 5,7 GB | 81 GB | **89 GB** | €4,47 | €5,36 |
| 10.000 clienti × 100 board, peggiore | 1.000.000 | 2,4 GB | 17 GB | 250 GB | **269 GB** | €13,45 | €16,14 |

Lo scenario da 10.000 clienti è quello indicato nel riepilogo della call (1 milione di board). A quel volume il ricavo è nell'ordine di €40.000 al mese: lo spazio resta trascurabile.

## Prestazioni e limiti dell'infrastruttura

- **Memoria del database**: conta l'insieme di dati usato spesso (indici di board, card aperte). Fino a 100.000 board sono poche centinaia di MB: il server attuale basta. Verso il milione di board servono indici caldi nell'ordine di qualche GB: un server database con 16 GB di RAM, circa €30–40 al mese in più. È il primo vero scalino di costo, ed è dovuto al numero di clienti attivi, non alle board per cliente.
- **Home**: carica tutte le board della persona con il conteggio delle card per colonna. Con 100 board resta nell'ordine di decine di millisecondi; oltre qualche centinaio servirebbero paginazione o ricerca nella lista (anche per l'usabilità).
- **Da fare oggi e calendario**: filtrano le card per scadenza con indici dedicati; il costo cresce con le card aperte, non con le board.
- **Routing AI**: con molte board peggiorano latenza e qualità della scelta. Lo schema accetta solo ID di board reali fino a 500 board; oltre, la validazione locale scarta comunque ID inventati e il testo torna alla scelta manuale.
- **Proposte AI**: il contesto inviato è sempre la sola board di destinazione, ridotto a 60 card: il costo per aggiornamento non cambia con il numero di board.

## Rischi e punti aperti

1. **Storico senza scadenza.** Oggi `ActivityEvent`, `UpdateLog` e le `AiProposal` applicate non vengono mai eliminati (lo sono solo proposte scadute/scartate dopo 30 giorni e notifiche lette dopo 90). È la voce che cresce di più. Decisione da prendere: per esempio compattare le fotografie prima/dopo oltre i 12 mesi, mantenendo chi ha fatto cosa e quando, che in call è stato apprezzato.
2. **Abuso tramite API o import.** Senza alcun tetto, uno script può creare migliaia di board. Un tetto tecnico alto e uguale per tutti protegge senza toccare il listino.
3. **Stime, non misure.** Prima di decidere, eseguire lo script in produzione e sostituire le ipotesi della tabella.

Nessuna differenza fra piani sulla quantità di board è stata introdotta. Resta aperta l'idea, discussa in call, di prezzare sul valore percepito invece che sul numero di board.

## Decisione dell'owner (25 ottobre 2026)

- **Board attive per persona**: 20 su Prova, Pro personale, Pro (e lo storico Solo); 50 su Family, Team, Enterprise e sui piani storici condivisi. **Business: illimitate**, con una soglia morbida di 200 a persona: superarla non blocca nulla, ma registra l’evento `BOARD_SOFT_LIMIT_EXCEEDED` nell’audit del back office e invia un’email ai superadmin di BoardCue (al massimo una volta ogni 30 giorni per organizzazione). Il limite dell'organizzazione è questo numero per le persone del piano (es. Team da 5 posti = 250 board). Il back office può ancora fissare un valore diverso per Enterprise.
- Chi è già oltre il limite **non perde nulla**: le board restano attive, ma non se ne creano né se ne ripristinano dall'archivio finché non si scende sotto.
- **Cronologia delle modifiche**: 6 mesi sui piani base, 24 sugli altri. Il job orario elimina per intero, a lotti da 5.000 righe, gli `ActivityEvent` (con le relative consegne push), gli `UpdateLog` e le `AiProposal` più vecchi del periodo. Board, card, commenti e consumi di fatturazione restano. Dopo la cancellazione non è più possibile annullare quelle modifiche né vedere chi le ha fatte.

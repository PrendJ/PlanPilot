# Interventi dopo la call del 23 ottobre 2026

Fonte: prompt "Codex_Boardcue" (riepilogo della call) più le indicazioni dell'owner del 25 ottobre: Family a €4,50 al mese per persona, Pro personale €4,90; aziende con Pro e Team a listino e Business su contatto; fornitori dentro la Privacy; lingua del footer strutturata; analisi del costo delle board; import di DOCX, Google Docs e formati Apple.

## IA (bloccante)

Causa radice trovata oltre a quelle del 23 ottobre: dopo la validazione dello schema, la proposta passava un secondo controllo sulla board (`validateAiPatch`) **fuori** dal ciclo di nuovo tentativo e di rimborso. Una risposta formalmente valida ma con un riferimento sbagliato (create senza colonna, ID vuoto `""`, move che ripete il titolo della card, ID inesistente) diventava subito `AI_INVALID_PATCH`: nessun tentativo con il modello complesso, nessun log dei campi, quota non restituita. Lo schema inviato diceva inoltre "null quando invariato" anche per la colonna di una nuova card.

- Lo schema per OpenRouter elenca gli **ID esatti** delle card e delle colonne inviate al modello (enum): il modello non può inventarli o storpiarli.
- `reconcilePatch` (lib/openrouter.ts) confronta la risposta con la board: normalizza solo i casi univoci (ID `""` = null, create senza colonna → prima colonna aperta, campi uguali al valore attuale, aggiornamenti senza effetto, move con campi → update visibile in anteprima) e segnala gli altri (card o colonna sconosciuta, card ripetuta, create su card esistente). Una segnalazione fa rigenerare **l'intera** proposta con il modello complesso; nulla viene applicato parzialmente.
- Il controllo finale ora sta nel blocco con il rimborso: se fallisce, la quota torna al cliente.
- Il routing dalla home elenca come enum gli ID delle board della persona (fino a 500).
- Prompt: per create `cardId` null e colonna obbligatoria.

Test: frase segnalata con colonna mancante e ID vuoto, rigenerazione con ID inventato, rimborso, schema con enum, board vuota. Non c'è una chiave OpenRouter locale: **nessuna verifica live**. Dopo il rilascio controllare nei log `invalid_board_reference` e `OpenRouter planning fallback`.

## Pubblico

- Landing: hero più breve (tolto "e ti fa approvare ogni modifica"; il controllo resta nei passi "Come funziona"), "lo fa per te" senza "dopo", claim in viola invece che arancione, card esplicative con risalto all'hover/tocco/focus (solo trasformazione e ombra, nessun salto di layout, rispetta "riduci movimento").
- Prezzi in landing: due card private centrate, blocco separato "Aziende e professionisti" verso `/pricing?customer=business`, FAQ centrate.
- Navigazione: pagina attiva sottolineata (anche sotto `/en`).
- Footer: gruppi Prodotto / Legale, "Subprocessori" rimosso; lingua in un blocco dedicato con selettore come nell'header, che porta alla stessa pagina nell'altra lingua e ricorda la scelta (prima i link "Italiano"/"English" portavano sempre alla home e il cookie poteva annullarli).
- Fornitori: tabella nella Privacy, sezione 5 "Fornitori e trasferimenti" (`/privacy#fornitori`); `/subprocessors` reindirizza lì. Provider AI aggiornati (OpenAI, Azure, Mistral al posto di Google).
- Demo: avviso di simulazione subito sotto il microfono, con invito a usare gli esempi.

## Prezzi

- Family **€4,50** IVA inclusa per persona al mese (netto €3,69), annuale €45,00 per persona (10 mensilità, regola esistente). Pro personale invariato a €4,90. Stripe crea un nuovo prezzo con nuova lookup key solo per i nuovi checkout: gli abbonati Family esistenti restano a €5,00 finché non si decide altrimenti.
- Aziende: Pro e Team con prezzo, **Business su contatto** (card con i vantaggi rispetto a Team e modulo). Il piano tecnico `BUSINESS` resta valido per chi lo ha e per il back office. Il modulo accetta team da 2 persone (prima da 25) e l'email arriva come "Richiesta Business".
- Tab Privati senza inviti Enterprise; "−" del Family visibilmente disabilitato a 2 posti.

## App

- "Da fare oggi": prime 5 attività per priorità e scadenza, "Mostra tutte", segno di spunta per completarle dalla home. La card va nella colonna "fatto" della sua board tramite la stessa API della board (permessi, cronologia con autore, revisione); avviso con "Annulla". Nessun record duplicato.
- Board: stessa larghezza massima di home e demo (1240 px), microfono a sinistra nell'input. L'input della board lavora già solo sulla board aperta.
- Hint "crea board personale": nascosto anche per le board personali create prima del preset PERSONAL (riconosciute dal nome).
- Import documenti: Word (.docx, anche i download di Google Docs), OpenDocument (.odt), RTF (TextEdit), HTML, testo e Markdown. I file Pages non sono leggibili fuori dagli strumenti Apple: l'app spiega come esportarli in Word. Link Google Docs condivisi come "Chiunque abbia il link": il server scarica solo l'esportazione testo da docs.google.com, senza usare l'account Google della persona. Il testo torna nella casella da rivedere prima dell'invio; il documento non viene salvato.
- Colore secondario: l'arancione dei token `--signal` è diventato un orchidea vicino al viola (contrasto AA nei due temi). Ambra e rosso restano solo per avvisi ed errori veri. Il puntino del logo resta arancione (asset di marca).
- Dark mode: le mini-colonne delle card board usavano il colore delle colonne, più scuro della card: apparivano come blocchi neri. Ora sono barre viola, contorno se vuote; la barra delle quote ha un bordo.
- Pulsante "App": puntino quando è pronta una nuova versione, finché non si aggiorna (nessun nuovo dato).

## Aperti

1. Decidere se portare gli abbonati Family esistenti a €4,50.
2. Verificare l'IA con una chiave reale dopo il rilascio.
3. Conservazione dello storico e tetto tecnico anti-abuso: vedi docs/ANALISI_COSTO_BOARD_2026-10-25.md.
4. "Da fare oggi" come board virtuale o pagina dedicata e riepilogo nel Profilo: non realizzati (proposte non vincolanti della call).
5. Rileggere i nuovi testi della landing e la dicitura "Fornitori" con chi cura gli aspetti legali.

## Aggiornamento del 25 ottobre: più attività in una frase

Segnalazione: «ricordami di chiamare la banca e di salvare il form entro stasera» diventava una sola card.

Cause:
1. Il prompt di pianificazione chiedeva «the smallest safe set of board mutations»: con GPT-5 nano a ragionamento minimo spingeva a fondere le attività in una card.
2. Il routing della home divideva il testo solo quando parti diverse andavano su board diverse, e solo in brani copiati alla lettera e contigui: due attività per la stessa board restavano un blocco unico, e non poteva proporre una board nuova.

Correzioni:
- Pianificazione: «esattamente un'azione per ogni attività distinta», mai fondere né spezzare, data e priorità valgono solo per l'attività a cui si riferiscono, «stasera/oggi» = oggi. Vale anche per l'input dentro la board.
- Routing (con almeno due board): restituisce `tasks`, un elemento per attività riscritto in forma autonoma con la sua data, la board (solo ID reali) oppure null con un nome di board nuova suggerito.
- Home: con un'attività sola e una board va diretta all'anteprima; con più attività mostra l'elenco, una riga per attività con testo modificabile, board già scelta e opzione «+ Nuova board…». Le board nuove si creano solo alla conferma (rispettando il limite del piano), poi l'anteprima di ogni board riceve le sue attività come elenco.
- Valutazione: aggiunti 3 casi `multi_create` (E201–E203) al set offline, compresa la frase segnalata.

Non verificato con il modello reale: manca una chiave OpenRouter locale. Dopo il rilascio eseguire `npm run ai:eval` sui casi `multi_create` e provare la frase dalla home.

## Aggiornamento del 26 ottobre: lunghezza del testo e revisione per board

- **Nessun taglio silenzioso.**
  - La casella di testo non tronca più quello che incolli (prima `maxLength` lo tagliava a 12.000 caratteri senza avviso).
  - Un contatore mostra «N / 12.000 caratteri», cioè circa 13 minuti di parlato per invio (stima: ~15 caratteri al secondo).
  - Oltre il limite avvisa che il testo sarà diviso in parti, elaborate una dopo l'altra.
  - L'import di documenti oltre 60.000 caratteri (~67 minuti) tiene l'inizio e dice quanti caratteri sono rimasti fuori.
  - Le trascrizioni Telegram arrivano fino a 60.000 caratteri (prima 12.000, tagliate senza avviso); oltre, il testo stesso lo segnala.
- **Registrazione**: si ferma da sola quando la trascrizione riempirebbe l'invio (al massimo 2 minuti come prima). Mostra il tempo disponibile; con meno di 10 secondi il microfono attende che il testo venga organizzato.
- **Dopo «Organizza i pensieri»** la pagina scorre fino al risultato (elenco attività o anteprime).
- **Revisione raggruppata per board**:
  - un blocco per board con le sue attività sotto, invece della board ripetuta su ogni riga;
  - in coda le board proposte dall'IA (con il pulsante «Crea board», che chiede conferma del nome) e le attività «Da assegnare»;
  - ogni attività si corregge, si sposta («Sposta…» o «Sposta tutte in…») o si elimina con la X, che diventa rossa al passaggio del mouse.
  - Si prosegue solo quando ogni attività è su una board esistente.
- Il routing chiede all'IA di dare **lo stesso nome di board nuova** alle attività dello stesso argomento e di proporre meno board possibili.

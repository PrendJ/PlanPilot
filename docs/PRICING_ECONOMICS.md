# BoardCue — listino ed economia unitaria

Aggiornato il 1 ottobre 2026 dopo la call di prodotto. Il codice in `lib/plans.ts` e `lib/stripe.ts` è la fonte per prezzi e limiti operativi. Gli importi di costo riportati sotto sono **ipotesi** da sostituire con dati di produzione prima di prendere decisioni commerciali.

## Listino attivo

| Destinatari | Piano | Prezzo mensile | Prezzo annuale | Aggiornamenti AI | Posti |
| --- | --- | ---: | ---: | ---: | ---: |
| Privati, IVA inclusa | Pro personale | €4,90 | €49,00 | 300/mese | 1 |
| Privati, IVA inclusa | Family | €5,00 per posto | €50,00 per posto | 300 per posto/mese, condivisi | minimo 2 |
| Aziende, IVA esclusa | Pro | €7,00 | €70,00 | 800/mese | 1 |
| Aziende, IVA esclusa | Team | €6,00 per posto | €60,00 per posto | 600 per posto/mese, condivisi | minimo 2 |
| Aziende, IVA esclusa | Business | €10,00 per posto | €100,00 per posto | 1.000 per posto/mese, condivisi | minimo 2 |
| Aziende | Enterprise | su preventivo | su preventivo | su misura | da 25 |

L'annuale addebita **dieci mensilità**, arrotondate per difetto ai 10 centesimi a favore del cliente (con i prezzi attuali il totale è già esatto). La pagina mostra solo il totale annuo e il risparmio rispetto al mensile, mai un equivalente mensile (decisione dell'owner del 2 ottobre 2026). La prova dura 14 giorni, senza carta, con 150 aggiornamenti AI. La dettatura è inclusa; 2FA ed export dati sono disponibili anche su Pro e Family. Le board non hanno un limite numerico di piano. Il pacchetto di 1.000 aggiornamenti extra costa €6,00 IVA esclusa per aziende o €7,30 IVA inclusa per privati.

I piani storici Solo, Team a prezzo fisso e Studio restano riconosciuti. Un cambio di prezzo crea nuovi Stripe Price; non cambia quelli degli abbonati esistenti. Chi ha già un abbonamento gestisce i cambi di piano nel portale Stripe, così non crea una seconda sottoscrizione. Il passaggio tra tipo aziendale e privato richiede assistenza, perché cambia il trattamento fiscale.

## Ipotesi di costo da riconvalidare

La valutazione del 23 settembre stimava €60/mese di costi fissi, €0,0014 per aggiornamento AI in media (mix testo/voce), circa 2,7% + €0,25 per transazione Stripe e €0,10 di infrastruttura marginale per cliente. Non comprende commercialista, supporto, acquisizione clienti o tempo del titolare. I prezzi dei provider, l'uso della dettatura e le commissioni effettive possono cambiare.

Applicando **solo queste ipotesi** e assumendo che ogni cliente consumi tutta la quota inclusa:

| Esempio mensile | Ricavo IVA esclusa stimato | AI | Stripe stimato | Infra | Contributo stimato |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pro privato, 1 persona | €4,02 | €0,42 | €0,38 | €0,10 | **€3,12** |
| Family privato, 2 persone | €8,20 | €0,84 | €0,52 | €0,10 | **€6,74** |
| Pro azienda, 1 persona | €7,00 | €1,12 | €0,44 | €0,10 | **€5,34** |
| Team azienda, 2 persone | €12,00 | €1,68 | €0,57 | €0,10 | **€9,65** |
| Business azienda, 2 persone | €20,00 | €2,80 | €0,79 | €0,10 | **€16,31** |

Il pareggio dei soli €60 di costi fissi, con questi margini e a pieno utilizzo, richiederebbe circa **20 Pro privati** oppure **9 Family da due persone**. È un esercizio di sensibilità, non una previsione di vendite. Le stime precedenti basate su Pro privato a €8,50 non si applicano al nuovo piano.

## Verifiche prima del lancio del listino

1. Misurare il costo AI reale per aggiornamento testuale, vocale e routing dalla home; il routing aggiunge una chiamata che la stima del 23 settembre non includeva.
2. Verificare commissioni Stripe, gestione dell'IVA e fatture in un account di test con piano privato mensile e annuale, Family con due e tre posti, cambio piano dal portale e rinnovo.
3. Monitorare consumo reale dei 300 aggiornamenti e costo del supporto per valutare sostenibilità di Pro e Family.
4. Verificare il tetto tecnico di costo AI e l'accesso in sola lettura a quota esaurita o pagamento cessato.

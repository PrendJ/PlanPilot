# Boardcue — evolutive e verifica

Aggiornato il 29 ottobre 2026. Le decisioni espresse in chat prevalgono sui numeri indicativi e sulle proposte del documento della riunione.

## Realizzato

- **BC-01:** sessione valida all’apertura di `/` → `/app`; sessione assente o revocata → accesso pubblico/login. Nessun ritorno alla landing durante una sessione valida.
- **BC-03:** un abbonamento contiene più workspace (es. Marketing e Sales), ciascuno con persone e board. Creazione, rinomina, spostamento delle board e gestione delle persone sono disponibili al titolare e agli amministratori del piano in `/workspaces`. Una persona può partecipare a più workspace consumando un solo posto. Family, Team e Business sono abilitati; Pro personale e Pro no. Restano compatibili i piani avanzati precedenti e i contratti Enterprise. Il contesto selezionato è separato dall’organizzazione personale originaria; cambiare contesto non promuove ruoli e la pagina prezzi non ripiega su un altro abbonamento.
- **Accessi:** i membri di un workspace ricevono accesso alle relative board. La rimozione dal workspace revoca solo gli accessi ereditati e le assegnazioni non più valide. Gli inviti diretti alle board restano validi, come spiegato nell’interfaccia. Un membro ordinario non può amministrare il piano o creare workspace. I controlli sono ripetuti nella transazione; gli inviti verificano i posti disponibili all’accettazione. Il ruolo “amministratore delle board” governa le board ereditate, non la creazione di altri workspace né il piano.
- **BC-04/05/06/07/08:** checkbox nella lista, gruppi Aperte/Completate, colonna Stato, icone di priorità, apertura del dettaglio dal resto della riga e scadenze senza ritorni a capo nel badge. Riaprire recupera la colonna precedente; se è stata eliminata o resa completata, usa Da fare o la prima colonna aperta. La colonna finale non implica più completamento. Lo stato esplicito si modifica nelle impostazioni della board.
- **BC-09/10/11:** piano, consumi, installazione, aggiornamenti e novità nell’account. Installazione nel menu profilo, nascosta in modalità PWA e dopo l’evento di installazione del browser. Lo storico parte dal presente pacchetto; si aggiorna in `components/ReleaseHistory.tsx`. Il comando “Segna come letto” memorizza la lettura per account sul dispositivo. Non sono inventati rilasci precedenti.
- **BC-02/12/14/16:** tema esistente preservato, demo con date relative e titoli senza mesi fissi, agenda con oggi/arretrati/prossimi sette giorni. Già presenti icona Apple PNG 180×180 e riferimenti versionati. “Primi passi” mantenuto.
- **BC-13:** l’IA supporta assegnatari e checklist oltre a scadenze, priorità e tag. Può assegnare solo membri attivi non ospiti della board, su richiesta esplicita; il prompt chiede chiarimento in caso di omonimia. I passi inferiti portano il contrassegno “Suggerito dall’IA” e non vengono creati già completati. Le proposte contenenti assegnazioni o checklist richiedono revisione anche con applicazione automatica attiva e nell’API v1. Salvataggio e annullamento includono entrambi i campi; l’applicazione verifica nuovamente gli accessi e le versioni delle task.
- **BC-15:** Family/Team hanno una soglia morbida condivisa di **50 board attive per posto acquistato**; Business **200**. Superarla non blocca creazione o lavoro: resta la segnalazione operativa agli amministratori Boardcue. I workspace non moltiplicano i posti o la quota. La quota IA resta rigida: esaurita la quota servono crediti o un contratto diverso. I pacchetti aggiuntivi estendono anche il budget di costo IA, evitando un blocco sul vecchio tetto.
- **Prezzi:** dal quarto posto il prezzo marginale scende linearmente fino al centesimo, arrotondato al decimo di euro. Oltre il centesimo resta al minimo. I primi tre posti restano al prezzo base. Il preventivo e i prezzi graduati Stripe usano gli stessi scaglioni. I vecchi abbonamenti mantengono il prezzo acquisito; la versione dei prezzi cambia localmente solo quando Stripe conferma il passaggio al nuovo catalogo.

## Prezzo minimo e ipotesi economiche

La base storica è `docs/PRICING_ECONOMICS.md`: stima media IA di €0,0014, infrastruttura variabile di €0,10, commissione stimata 2,7% + €0,25 e costi fissi complessivi stimati €60/mese. Questi dati non costituiscono un consuntivo aggiornato.

Per il minimo è stato scelto un costo prudenziale **€0,005 per aggiornamento incluso**, corrispondente al valore del circuito di protezione IA assumendo parità USD/EUR, oltre a €0,10 di infrastruttura per posto e quota di commissione fissa. Il calcolo protegge un **margine di contribuzione del 30%**, includendo le commissioni variabili e l’annuale pagato per dieci mesi con costi per dodici. Il minimo viene arrotondato verso l’alto a €0,10; i prezzi marginali intermedi al decimo più vicino. Per effetto dell’arrotondamento, i primi posti aggiuntivi possono ancora costare quanto il prezzo base.

| Piano | Primi 3 posti, ciascuno/mese | Minimo dal 100° posto/mese | Regime mostrato |
| --- | ---: | ---: | --- |
| Family | €4,50 | €3,80 | IVA inclusa |
| Team | €6,00 | €5,80 | IVA esclusa |
| Business | €10,00 | €9,40 | IVA esclusa; vendita su contatto |

**Questo non garantisce il 30% di utile netto aziendale:** supporto, tempo del titolare, acquisizione clienti, costi fissi per cliente e fiscalità effettiva non sono misurati. La riserva per i costi fissi dipende dal volume complessivo. Il minimo si può ricalibrare in `lib/seat-pricing.ts` quando sono disponibili consuntivi. Non sono stati modificati contratti o addebiti esistenti.

Implementazione Stripe: scaglioni `graduated` con quantità di posti, non sconto retroattivo sull’intero gruppo. Riferimenti ufficiali: [modelli di prezzo](https://docs.stripe.com/products-prices/pricing-models) e [configurazione portale](https://docs.stripe.com/customer-management/configure-portal).

## Verifiche

- Migrazione additiva `0016_customer_spaces_and_task_reopen`, verificata su PostgreSQL locale temporaneo. Le board esistenti rimangono fuori dai nuovi workspace; gli accessi diretti sono preservati. Le vecchie colonne personalizzate riconoscibili come completate mantengono il completamento tramite migrazione dello stato.
- Suite automatica con transazioni reali per permessi, assegnazioni, riapertura, revisioni, annullamento IA, quote e crediti; modelli IA e pagamenti simulati.
- Build di produzione e controlli dei tipi superati; 440 test automatici superati su PostgreSQL locale temporaneo. Nei browser desktop 1440 e mobile 375: 53 test superati, 11 esclusi per il dispositivo non previsto dal singolo caso.

Il controllo automatico dell’IA verifica schema, confini e persistenza: non dimostra che un modello reale interpreti correttamente ogni frase. Per la prova reale usare: “Assegna a Maria il preventivo” (un’unica Maria nella board); “Assegna a Luca la task” (due Luca → chiarimento); “Prepara il lancio e suggerisci i passi” (passi suggeriti etichettati e da rivedere); “Completa il preventivo” e poi riaprire (stato precedente recuperato).

## Residui operativi

- Applicare la migrazione insieme al rilascio. Nessun deploy o aggiornamento di un database reale eseguito in questa attività.
- Verificare checkout/portale e webhook con un account Stripe di test prima del rilascio commerciale; le verifiche locali non creano prezzi reali.
- Provare audio, Telegram/Slack e interpretazione IA con i servizi effettivamente configurati; non sono stati inviati messaggi a persone né effettuate chiamate IA reali per queste prove.
- L’icona iOS richiede prova su iPhone fisico. Se resta in cache la vecchia icona, rimuovere il collegamento e aggiungerlo nuovamente da Safari. Un browser non permette sempre di sapere se l’app è installata altrove; è affidabile la rilevazione della finestra PWA e dell’evento di installazione nella sessione.
- Per il margine netto del 30% servono i costi effettivi mancanti indicati sopra; nessuna funzione dipende da un numero di costo inventato.

# BoardCue — costi, prezzo minimo e sconti sui posti

Analisi del 30 ottobre 2026. **Aggiornamento dello stesso giorno:** gli scaglioni Team e Family sono stati applicati al listino (`lib/seat-pricing.ts`, `lib/plans.ts`). Per decisione del titolare, Family scende fino a €4,00 invece di €4,35: vedi [Decisione del titolare su Family](#decisione-del-titolare-su-family). Business non ha listino pubblico: è un canone dedicato concordato con ogni azienda.

## Risultato

Con le ipotesi operative qui esplicitate, a **1.000 posti paganti complessivi sulla piattaforma**, il minimo mensile e il prezzo proposto per i posti dal centesimo di ciascun abbonamento sono:

| Piano | Base, primi 3 posti | Minimo calcolato | Prezzo dal centesimo posto | Sconto sul prezzo del singolo posto | Trattamento |
| --- | ---: | ---: | ---: | ---: | --- |
| Family | €4,50 | €4,35 | **€4,35** | 3,33% | IVA italiana inclusa |
| Team | €6,00 | €4,97 | **€5,00** | 16,67% | IVA esclusa |
| Business | €10,00 | €9,96 | **€10,00** | nessuno | IVA esclusa |

L'annuale resta dieci volte il totale mensile del listino, con dodici mesi di servizio. I minimi sono arrotondati **per eccesso al centesimo**, perché arrotondare il minimo al centesimo più vicino può scendere sotto l'obiettivo. **Tutti i prezzi degli scaglioni sono multipli di 5 centesimi** (seconda cifra decimale 0 o 5): il prezzo dal centesimo posto è il minimo arrotondato per eccesso ai 5 centesimi successivi.

Questi sono **minimi matematici dello scenario**, non costi effettivi certificati. Proteggono un margine operativo del 30% sui ricavi al netto IVA, dopo le voci modellate e prima delle imposte sul reddito. Il 30% di margine è più rigoroso di un ricarico del 30% sui costi, che lascia un margine del 23,08%.

**La mia proposta commerciale:** Team ha spazio per uno sconto visibile. Su Family lo spazio è piccolo; su Business, con tre minuti di assistenza prioritaria per posto al mese, è quasi nullo. Per uno sconto Business significativo serve un'assistenza organizzata con un referente del cliente, un servizio aggiuntivo a pagamento oppure una diversa combinazione prezzo base/quota IA. Con prezzi a passi di 5 centesimi Business resta a €10 su tutti i posti: €9,95 lascerebbe un margine del 29,96%, sotto l'obiettivo del 30%.

Questa proposta di progressione vale nello scenario operativo atteso. **Non soddisfa il 30% nel caso limite di spesa IA al tetto tecnico**: quel caso richiede minimi più alti dei prezzi base. Se il 30% deve valere anche in quel caso, occorre rivedere i prezzi base o i costi/quote prima di introdurre sconti.

## Dati confermati e dati ancora stimati

| Voce | Evidenza | Impiego nel calcolo |
| --- | --- | --- |
| Hosting attuale Contabo | Owner: €7,50/mese | Costo comunicato; piano hardware, IVA e condivisione con altri progetti non accertati |
| Tempo del titolare | Owner: €50/ora | Assistenza e manutenzione valorizzate, anche se non generano un pagamento a un dipendente |
| Software di hosting | Repository: Coolify, Docker Compose, Next.js, PostgreSQL 16 | Applicazione e database sullo stesso stack; nessun costo obbligatorio di Vercel, Supabase o GPU locale emerge dal progetto |
| Coolify | Self-hosted gratuito; esiste anche Cloud a pagamento | Si assume self-hosted; eventuale abbonamento Cloud va aggiunto |
| IA | OpenRouter; Nano, Mini e Whisper Turbo predefiniti nel codice | Le selezioni effettive e i costi del database di produzione non sono stati letti |
| Costi fissi precedenti | €60/mese nei documenti e valore di default | Stima storica, non fattura del server |
| Posti paganti complessivi | Non comunicati | 100, 500, 1.000 e 5.000 sono scenari; non il numero dei clienti attuali |
| Backup, posta, dominio, contabilità, acquisizione | Fatture non disponibili | Budget tecnici espliciti; costi amministrativi/commerciali non quantificati separati sotto |

Coolify gestisce il deploy; non è il fornitore della macchina. [Tariffe Coolify](https://coolify.io/pricing). Contabo documenta un servizio non gestito: l'amministrazione dell'applicazione e del sistema resta un costo nostro. [Documentazione Contabo](https://docs.contabo.com/docs/products/storage-vps/).

Le pagine di listino Contabo consultate non danno un preventivo affidabile per il contratto specifico dell'owner, e alcune restituiscono 403. Non associo €7,50 a uno SKU né invento la RAM disponibile. I budget seguenti sono **accantonamenti di progetto, non preventivi Contabo né capacità misurate**.

## Come modellare la crescita dell'infrastruttura

L'IA gira presso i provider esterni. L'hosting locale serve pagine, API, database, eventi in tempo reale, email, notifiche e job. Più utenti non richiedono automaticamente un server IA o GPU.

| Scenario economico | Posti paganti totali | Budget tecnico condiviso/mese | Manutenzione piattaforma | Totale condiviso | Quota per posto |
| --- | ---: | ---: | ---: | ---: | ---: |
| Avvio | 100 | €15 | 2 ore = €100 | €115 | €1,15 |
| Crescita | 500 | €60 | 2 ore = €100 | €160 | €0,32 |
| Consolidamento | 1.000 | €120 | 2 ore = €100 | €220 | €0,22 |
| Scala maggiore | 5.000 | €500 | 6 ore = €300 | €800 | €0,16 |

€15 all'avvio significa il server attuale più €7,50 di riserva tecnica: non è un costo di backup già pagato. Per €120 si può impostare, come budget da verificare, €30 applicazione, €50 database, €20 backup esterni e €20 posta/dominio/monitoraggio. La ripartizione non è un listino dei fornitori.

A questi budget aggiungo **€0,10 per posto/mese di riserva di capacità e consumi**. Non è una seconda fattura del server: è una prudenza esplicita per crescita dello spazio, traffico e servizi. A 1.000 posti il budget tecnico complessivo diventa quindi €220/mese, più €100 di manutenzione. A 5.000 posti è €1.000 tecnico più €300 manutenzione.

Questa tabella mostra perché una struttura anche molto più costosa può pesare meno su ogni posto. **Non significa che il server da €7,50 sostenga 100 o 1.000 utenti simultanei.** L'acquisto dello scalino successivo va deciso con misure di CPU, memoria, I/O e latenza database, connessioni/eventi simultanei, dimensione dello storico e tempi di backup/ripristino. Staging, disponibilità elevata e personale reperibile possono richiedere budget superiori.

Un aumento di €100/mese, distribuito su 1.000 posti, alza il minimo di circa **€0,23 Family** o **€0,19 Team/Business**. Lo stesso aumento su soli 100 posti lo alza di circa €2,28 / €1,87. Questo vale a parità di tutte le altre ipotesi.

## IA: costo completo, non solo una chiamata

Le tariffe pubbliche consultate indicano Nano a $0,05/$0,40 per milione di token in ingresso/uscita e Mini a $0,25/$2. Whisper Turbo ha provider con prezzi diversi: nella pagina consultata $0,000003–$0,000011 al secondo. Sono listini, non il costo medio effettivo di BoardCue. [Nano](https://openrouter.ai/openai/gpt-5-nano), [Mini](https://openrouter.ai/openai/gpt-5-mini), [Whisper Turbo](https://openrouter.ai/openai/whisper-large-v3-turbo).

La fee OpenRouter Standard è 5,5% sulla ricarica; Business 8%. Non basta sommare i costi delle generazioni ignorando la ricarica. [OpenRouter Pricing](https://openrouter.ai/pricing).

Lo scenario usa **€0,0025 per aggiornamento a quota interamente consumata**, inclusi routing dalla home, mix Nano/Mini, trascrizione, tentativi aggiuntivi e fee di ricarica. Nessuno sconto derivante da cache o quota inutilizzata viene richiesto per raggiungere i minimi.

Un esempio di verifica dell'ordine di grandezza, interamente ipotetico: 5.000 token in ingresso e 800 fatturabili in uscita, 70% Nano e 30% Mini, una chiamata di routing da 5.000/300 token per aggiornamento e metà aggiornamenti con 30 secondi audio al prezzo superiore citato. Aggiungendo il 15% per tentativi/costi aggiuntivi e il 5,5% di ricarica, con parità USD/EUR, si ottengono circa €0,00217. Il budget €0,0025 lascia ulteriore spazio. I token di ragionamento fatturati devono stare nel conteggio: il solo testo visibile non basta.

**Questo esempio non prova il mix reale.** Il codice passa a Mini per contesti grandi o richieste complesse. Le nuove checklist e gli assegnatari aumentano il contesto; i limiti di 60 card e descrizioni troncate non equivalgono a un tetto fisso di token. Tante board aumentano il routing; i retry e le trascrizioni non seguite da un aggiornamento hanno comunque un costo. La misura corretta è la spesa complessiva di questi percorsi divisa per gli aggiornamenti conteggiati.

Il circuito tecnico attuale usa $0,005 per aggiornamento incluso come budget aggregato. Con cambio di stress 1 USD = 1 EUR e fee 5,5%, lo scenario al tetto costa **€0,005275**. Non è la media attesa né un limite esatto per singola richiesta: verifiche prima delle chiamate, richieste contemporanee e contabilità del provider possono produrre scostamenti. Una quota numerica rigida non garantisce che una chiamata lunga costi poco.

## Pagamenti e IVA

Stripe Italia pubblica 1,5% + €0,25 per carte SEE standard e 2,8% + €0,25 per carte SEE premium; Billing è 0,7%, Tax integrato 0,5% quando applicabile. [Payments e Tax](https://stripe.com/it/pricing), [Billing](https://stripe.com/it/billing/pricing).

Il modello accantona **4% dell'importo lordo incassato + €0,25 per fattura**: copre la somma premium + Billing + Tax ed è volutamente prudente applicando tutte le percentuali al lordo. Le condizioni reali e le rispettive basi imponibili vanno riconciliate con Stripe. Le carte internazionali e le conversioni possono costare di più. Il precedente 2,7% non è necessariamente sbagliato: coincide con la somma standard + Billing + Tax, ma non va sommato nuovamente a Billing/Tax.

Per Family si scorpora l'IVA 22% dal prezzo mostrato; per Team/Business il prezzo è netto e il modello assume un incasso italiano con IVA 22% per calcolare le commissioni. L'IVA riscossa non è ricavo. L'IVA detraibile sugli acquisti non è costo; se non detraibile va aggiunta. Vendite estere possono avere trattamento diverso.

Nell'annuale il costo fisso €0,25 si paga una volta per fattura annuale, non ogni mese e non per ciascun posto. Il minimo usa l'allocazione su 100 posti; il calcolo degli esempi usa una sola commissione fissa sull'intero abbonamento.

## Assistenza e costi per posto

A €50/ora:

| Tempo medio mensile per posto | Costo mensile | Costo annuale |
| --- | ---: | ---: |
| 1 minuto | €0,8333 | €10 |
| 3 minuti | €2,50 | €30 |
| 5 minuti | €4,1667 | €50 |

Sono medie: un'azienda da 100 posti che richiede 100 minuti al mese equivale a un minuto per posto. Nel caso base considero **un minuto Family/Team, tre minuti Business** per l'assistenza prioritaria. Sono assunzioni di servizio da misurare; non limiti imposti ai clienti. Le due ore di manutenzione piattaforma sono aggiuntive, per evitare di confonderle con il tempo dedicato alle richieste dei clienti.

| Costo mensile per posto, a 1.000 posti complessivi | Family | Team | Business |
| --- | ---: | ---: | ---: |
| IA, tutta la quota: 300 / 600 / 1.000 | €0,75 | €1,50 | €2,50 |
| Infrastruttura condivisa, €120/1.000 | €0,12 | €0,12 | €0,12 |
| Manutenzione, €100/1.000 | €0,10 | €0,10 | €0,10 |
| Riserva capacità/consumi | €0,10 | €0,10 | €0,10 |
| Assistenza | €0,8333 | €0,8333 | €2,50 |
| **Totale prima di pagamenti e riserva rischi** | **€1,9033** | **€2,6533** | **€5,32** |

Aggiungo l'**1% dei ricavi netti** come riserva per rimborsi, insoluti e contestazioni. Non è una garanzia contro ogni perdita. Il prezzo è calcolato lasciando il 30% dopo tutte queste voci.

Con tutti gli altri parametri invariati, il minimo cambia così:

| Assistenza mensile media per posto | Family | Team | Business |
| --- | ---: | ---: | ---: |
| 1 minuto | €4,35 | €4,97 | €6,84 |
| 3 minuti | €8,16 | €8,09 | €9,96 |
| 5 minuti | €11,96 | €11,21 | €13,08 |

**Business a €6,84 richiede un minuto medio, anziché tre.** Non è il minimo raccomandato mantenendo l'ipotesi di assistenza prioritaria del caso base.

## Sensibilità alla scala e al caso limite

Minimi per lo stesso obiettivo del 30%, inclusi i budget e le ore della tabella di crescita:

| Posti paganti complessivi | Family | Team | Business |
| --- | ---: | ---: | ---: |
| 100 | €6,47 | €6,71 | €11,70 |
| 500 | €4,58 | €5,16 | €10,15 |
| 1.000 | €4,35 | €4,97 | €9,96 |
| 5.000 | €4,21 | €4,86 | €9,85 |

I minimi sopra la base indicano che **non si raggiunge il 30% allocando quei costi al singolo posto al prezzo minimo**. Non implicano automaticamente una perdita di cassa: il tempo del titolare è un costo economico e il fatturato totale dipende dai primi posti a prezzo maggiore, dal mix dei piani e dal mensile/annuale.

I 1.000 posti sono dell'intera piattaforma. Il centesimo posto è invece dentro un singolo abbonamento. Non vanno confusi; non è corretto garantire il margine del caso da 1.000 posti quando la piattaforma ne ha solo 100. Il totale degli abbonamenti va modellato come somma degli scaglioni effettivi, e i costi fissi si sottraggono una volta sola.

A 1.000 posti e al **tetto IA di stress**, mantenendo assistenza e tutte le altre ipotesi:

| Piano | Minimo per mantenere 30% nello stress |
| --- | ---: |
| Family | €6,25 IVA inclusa |
| Team | €8,09 IVA esclusa |
| Business | €15,16 IVA esclusa |

Quindi non esiste una discesa dai prezzi base €4,50 / €6 / €10 che garantisca il 30% anche in questo scenario. Cambiare l'arrotondamento non risolve la differenza. Per mantenere i listini attuali occorre governare il costo medio e la complessità delle chiamate, misurarli e distinguere l'obiettivo atteso dalla protezione nel caso limite.

## Scaglioni proposti dal quarto al centesimo posto

Si applica il prezzo solo ai posti nello scaglione, senza ricalcolare retroattivamente tutti i posti. I primi tre rimangono invariati; il minimo è raggiunto **dal centesimo**, mai anticipato per effetto dell'arrotondamento.

| Posizione del posto | Family, IVA inclusa | Team, IVA esclusa | Business, IVA esclusa |
| --- | ---: | ---: | ---: |
| 1–3 | €4,50 | €6,00 | €10,00 |
| 4–9 | €4,45 | €5,95 | €10,00 |
| 10–19 | €4,45 | €5,95 | €10,00 |
| 20–29 | €4,45 | €5,80 | €10,00 |
| 30–39 | €4,45 | €5,70 | €10,00 |
| 40–49 | €4,45 | €5,60 | €10,00 |
| 50–59 | €4,45 | €5,50 | €10,00 |
| 60–69 | €4,40 | €5,40 | €10,00 |
| 70–79 | €4,40 | €5,30 | €10,00 |
| 80–89 | €4,40 | €5,20 | €10,00 |
| 90–99 | €4,40 | €5,10 | €10,00 |
| **100 e successivi** | **€4,35** | **€5,00** | **€10,00** |

Gli scaglioni approssimano la discesa lineare: si valuta il prezzo alla prima posizione della fascia, arrotondato ai 5 centesimi più vicini, e lo si mantiene nella fascia. Il quarto posto riceve almeno 5 centesimi di sconto; le posizioni precedenti alla centesima restano almeno 5 centesimi sopra il prezzo dal centesimo. Le fasce contigue con lo stesso prezzo possono essere accorpate: Family diventa 4–59 a €4,45, 60–99 a €4,40, dal 100 a €4,35; Team accorpa 4–19 a €5,95. Business non ha scaglioni perché fra €9,96 e €10 non c'è un multiplo di 5 centesimi.

| Abbonamento da 100 posti | Totale mensile | Totale annuale | Media per posto nel listino mensile |
| --- | ---: | ---: | ---: |
| Family | €443,05 | €4.430,50 | €4,4305 |
| Team | €554,20 | €5.542,00 | €5,5420 |
| Business | €1.000,00 | €10.000,00 | €10,00 |

Family IVA inclusa; Team/Business IVA esclusa. Il posto 101 aggiunge rispettivamente €4,35, €5,00 o €10,00 al totale mensile. Nell'annuale aggiunge dieci volte tali importi.

Con le ipotesi del caso da 1.000 posti complessivi, il margine degli abbonamenti da 100 posti, annuali, è circa 31,22% Family, 36,66% Team e 30,28% Business. È superiore al minimo marginale grazie ai primi posti più cari.

### Decisione del titolare su Family

Il 30 ottobre il titolare ha scelto di far scendere Family fino a **€4,00 IVA inclusa dal centesimo posto**, sotto il minimo calcolato di €4,35. Le fasce applicate sono:

| Posizione del posto | Family, IVA inclusa |
| --- | ---: |
| 1–3 | €4,50 |
| 4–19 | €4,45 |
| 20–29 | €4,40 |
| 30–39 | €4,35 |
| 40–49 | €4,30 |
| 50–59 | €4,25 |
| 60–69 | €4,20 |
| 70–79 | €4,15 |
| 80–89 | €4,10 |
| 90–99 | €4,05 |
| **100 e successivi** | **€4,00** |

Fino a 19 posti i totali coincidono con la proposta a €4,35, quindi le famiglie reali pagano lo stesso. Nello scenario da 1.000 posti un posto a €4,00 lascia un margine annuale del 24,45%. Un abbonamento da 100 posti costa €426,70 al mese e lascia il 28,81%, invece di €443,05 e 31,22%. Il minimo scenderebbe sotto €4,00 con meno di ¾ di minuto di assistenza per persona al mese (€3,88), con un costo IA medio di €0,0014 per aggiornamento (€3,60) o con 200 aggiornamenti per persona (€3,78).

## Effetti sul resto del sistema

1. **Family a €3,80 e Business a €9,40 non sono confermati come minimi sostenibili.** Nel nuovo scenario, confrontando 100 posti tutti al vecchio minimo per isolare il prezzo marginale, il margine annuale è circa 20,78% Family e 26,20% Business. Team a €5,80 lascia circa 39,22%. Le conclusioni precedenti ignoravano costi oggi valorizzati e non sono una garanzia di utile.
2. **Annuale e sconti volume si sommano.** Incassare dieci mensilità impone un prezzo nominale maggiore rispetto a dodici. Eventuali coupon, referral, sconti manuali e prorata devono rispettare il margine finale; il checkout attuale consente codici promozionali.
3. **Crediti IA extra:** il pacchetto da 1.000 a €6 netti non mantiene il 30% nello stress. Solo l'IA costa €5,275 prima delle commissioni: restano €0,725. Con la media €0,0025 il costo IA è €2,50. Non è possibile dedurre la redditività dei pacchetti dalla sola redditività degli abbonamenti.
4. **Prove e licenze gratuite/lifetime:** hanno costo ma non posti paganti. Una prova con tutti i 150 aggiornamenti, a €0,0025, costa €0,375 di IA. Dieci prove per un cliente pagante sono €3,75 di sola IA da recuperare nel ciclo di vita. Una licenza Lifetime configurata a 20.000 aggiornamenti/mese costa fino a €50 nello scenario atteso, €105,50 nello stress. Questi costi vanno aggiunti al budget comune se presenti; non risultano già compresi nei €120 tecnici.
5. **Workspace, board e utenti:** una persona in più workspace del medesimo piano resta un posto; workspace aggiuntivi non moltiplicano la quota. Ospiti gratuiti e utenti non paganti consumano comunque risorse. La cronologia avanzata di 24 mesi, le checklist, le assegnazioni e i backup vanno misurati. La soglia morbida delle board non impedisce costi superiori alla media. Gli allegati binari non sono attualmente un servizio di storage incluso da valorizzare come già operativo.
6. **Back office economico:** il codice usa ancora fee stimate, un costo fisso di default e una riduzione forfettaria del 30% per stimare il netto. Per i privati il valore di ricavo usato deriva da un prezzo IVA inclusa. Non è una riconciliazione bancaria/fiscale. Prima di usarlo per validare questi minimi servono ricavi al netto IVA, commissioni reali, ricariche IA, costo del tempo e distinzione tra importi fatturati/incassati.
7. **Amministrazione, acquisizione, sviluppo:** commercialista, fatturazione elettronica esterna, advertising, onboarding dedicato e sviluppo del prodotto non hanno un costo accertato in questa analisi. Il 30% residuo non può essere chiamato utile netto dopo averli ignorati. Per esempio, aggiungere €200/mese di costi condivisi a 1.000 posti alza i minimi di circa €0,46 Family o €0,37 Team/Business; una riserva da €0,50 per posto per acquisizione/ammortamenti li alza di circa €1,14 / €0,94. Non sono costi accertati, ma sensibilità.
8. **Revisioni del listino:** il catalogo graduato e i prezzi Stripe devono restare versionati. La proposta qui non cambia addebiti o contratti esistenti; se approvata, il preventivo, Stripe e la documentazione dovranno usare gli stessi scaglioni.

## Formula riproducibile

Per un posto al minimo, con fattura da almeno 100 posti:

- C = quota IA × costo medio completo + riserva capacità + (budget tecnico condiviso + ore manutenzione × €50) / posti paganti complessivi + minuti assistenza × €50/60.
- Prezzo netto mensile di listino minimo = (12 × C + €0,25/100) / [10 × (1 − 0,30 − 0,01 − 0,04 × 1,22)].
- Family = risultato netto × 1,22; Team/Business = risultato netto.
- Si arrotonda il minimo verso l'alto al centesimo; il prezzo dal centesimo posto è il minimo arrotondato verso l'alto ai 5 centesimi, senza superare il prezzo base.

La formula copre il caso annuale. Il mensile beneficia di dodici incassi, ma sostiene dodici commissioni fisse per abbonamento; i casi piccoli vanno controllati separatamente.

Calcoli e tutti gli scaglioni riproducibili in [pricing-scenarios.mjs](../scripts/pricing-scenarios.mjs), risultati in [PRICING_SCENARIOS_2026-10-30.json](PRICING_SCENARIOS_2026-10-30.json). Le verifiche automatiche controllano prezzi multipli di 5 centesimi, monotonia, primi tre posti, prima riduzione dal quarto, prezzo minimo solo dal centesimo, totale incrementale del posto 101, margine dello scenario e insufficienza di un centesimo sotto il minimo calcolato. Nessuna chiamata a Stripe, OpenRouter o database di produzione è stata eseguita.

## Dati da misurare per trasformare la proposta in un listino

Numero dei posti realmente paganti e distribuzione fra piani; costo Contabo comprensivo di opzioni/backup e trattamento IVA; minuti mensili di assistenza per piano e di manutenzione generale; consumo e costo IA complessivo per aggiornamento, includendo tentativi falliti; costi amministrativi/commerciali e utenti gratuiti. Un periodo di misurazione rappresentativo permette di sostituire le ipotesi senza simulare precisione al centesimo su input sconosciuti.


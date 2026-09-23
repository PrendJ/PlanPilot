# BoardCue — listino ed economia unitaria

> 23 settembre 2026 · listino definito con il titolare. Prezzi per aziende IVA esclusa; per i privati IVA inclusa. I costi di infrastruttura sono **stime**: sostituiscile con i tuoi valori reali (anche nella variabile `MONTHLY_FIXED_COST_EUR`, usata dal backoffice).

## Decisioni del titolare recepite

- Niente piano Free: solo **prova di 14 giorni del piano Pro** (1 persona, 150 aggiornamenti AI), senza carta.
- **Dettatura sempre inclusa** in tutti i piani e nella prova.
- **Board illimitate** in tutti i piani (nessun limite sul numero di board).
- **Team e Business: minimo 2 posti.** Gli ospiti (sola lettura + commenti) non occupano posti.
- **Nessun SSO, DPA dedicato o SLA** nell'Enterprise (né altrove).
- **Nessuna cancellazione per mancato pagamento**: a fine prova o abbonamento il team viene congelato in sola lettura, consultabile ed esportabile.
- **2FA con app di autenticazione per tutti i piani**; nel Business il proprietario può renderla obbligatoria.
- **AI via OpenRouter, endpoint standard** (niente piano Business): solo provider a zero conservazione che non addestrano sui dati; il provider non deve essere europeo. Fee OpenRouter 5,5%.
- **Pro a €7/mese**, annuale con 2 mesi gratis (€70/anno). **Team e Business riscalati** in proporzione: €6 e €10 per posto.
- **Privati: prezzo IVA inclusa arrotondato per difetto alla decina di centesimi** (Pro €7 × 1,22 = €8,54 → €8,50). L'annuale privati resta "2 mesi gratis" esatto: 10 × il mensile.
- **Compatibile con lo Stripe attuale**: nessun prezzo da creare a mano (vedi in fondo).

## Listino

| Piano | Aziende e professionisti (IVA esclusa) | Privati (IVA inclusa) | Persone | Aggiornamenti AI/mese | Extra |
|---|---|---|---|---|---|
| **Prova Pro** | €0 per 14 giorni | €0 per 14 giorni | 1 | 150 in totale | tutte le funzioni Pro |
| **Pro** | €7/mese · €70/anno | €8,50/mese · €85/anno | 1 | 800 | board illimitate, dettatura, anteprima, viste, import/export, 2FA |
| **Team** | €6/posto/mese · €60/posto/anno (min. 2) | €7,30 · €73 | per posto | 600 per posto, condivisi | tempo reale, commenti e menzioni, ospiti gratuiti, API e webhook |
| **Business** | €10/posto/mese · €100/posto/anno (min. 2) | €12,20 · €122 | per posto | 1.000 per posto, condivisi | 2FA obbligatoria per il team, export audit, supporto prioritario, call di onboarding |
| **Enterprise** | su preventivo (da 25 posti) | — | su misura | su misura | prezzo per volume, onboarding e formazione |
| **Pacchetto** | €6 una tantum | €7,30 | — | +1.000, non scadono | usati dopo quelli inclusi nel mese |

**Perché riscalare Team e Business.** Con il Pro a €7, un Team a €9 per posto costava a persona più del Pro, e il Business da 2 posti (€30) era oltre 4 volte il Pro. Ora la scala è coerente: 1 persona €7, 2 persone in Team €12 (meno di due Pro), 2 persone in Business €20. Oltre i 25 posti c'è l'Enterprise con prezzo per volume, quindi non servono sconti a scaglioni dentro Team e Business.

**Clienti storici:** chi paga già Solo (€10), Team a prezzo fisso (€24, fino a 10 persone, ora `TEAM_LEGACY`) o Studio (€59) resta al suo prezzo e ai suoi limiti finché non cambia piano.

Un **aggiornamento AI** = una richiesta di interpretazione (testo o dettatura), anche se la proposta viene poi scartata. Se il provider AI non risponde, l'aggiornamento viene restituito.

## Costi fissi mensili stimati (titolare)

| Voce | Stima €/mese | Note |
|---|---|---|
| VPS produzione (app + PostgreSQL, Coolify) | 15 | es. 4 vCPU / 8 GB in UE |
| VPS staging | 5 | istanza piccola |
| Backup fuori sede cifrati | 4 | Storage Box / S3 compatibile in UE |
| Email transazionali | 15 | provider UE, ~20k email/mese |
| Fatturazione elettronica (SDI) | 10 | software/servizio di trasmissione |
| Dominio e DNS | 2 | |
| Monitoraggio (Uptime Kuma, GlitchTip self-hosted) | 0 | sul VPS esistente |
| Margine per imprevisti | 9 | |
| **Totale** | **60** | valore di default di `MONTHLY_FIXED_COST_EUR` |

Non inclusi: commercialista, consulenza legale, marketing, tempo del titolare.

## Costi variabili per cliente

Cambio usato: $1 ≈ €0,87. Prezzi OpenRouter a settembre 2026, endpoint a zero conservazione (`/api/v1/endpoints/zdr`), fee 5,5% inclusa.

| Voce | Stima | Base |
|---|---|---|
| Aggiornamento testuale | ≈ $0,0008 (€0,0007) | Gemini 2.5 Flash-Lite (Google Vertex, ZDR): $0,10/M input, $0,40/M output; ~5k token in, ~600 out (contesto potato a 60 card) |
| Aggiornamento vocale | ≈ $0,0025 (€0,0022) | + Voxtral Mini Transcribe (Mistral, ZDR) $0,0033/min, ~30 s |
| Media prudenziale per aggiornamento | **≈ €0,0014** | mix 50% voce |
| Stripe | ≈ 2,7% + €0,25 | carte UE 1,5% + €0,25, Billing 0,7%, Tax 0,5% |
| Infrastruttura marginale | ≈ €0,10 | per cliente attivo |

Alternative a costo simile: GPT-5 nano ($0,05/$0,40, ragionamento minimo) ≈ $0,0006; Mistral Small ($0,15/$0,60) ≈ $0,0011.

## Margine nel caso peggiore (tutti gli aggiornamenti inclusi consumati)

| Piano | Ricavo netto/mese | Costo AI massimo | Stripe | Infra | Margine di contribuzione |
|---|---|---|---|---|---|
| Pro mensile, azienda | €7,00 | €1,12 (800) | €0,44 | €0,10 | **€5,34 (76%)** |
| Pro mensile, privato (€8,50 IVA incl.) | €6,97 | €1,12 | €0,48 | €0,10 | **€5,27 (76%)** |
| Pro annuale | €5,83 | €1,12 | €0,18 | €0,10 | **€4,43 (76%)** |
| Team, 2 posti | €12,00 | €1,68 (1.200) | €0,57 | €0,10 | **€9,65 (80%)** |
| Team, 5 posti | €30,00 | €4,20 (3.000) | €1,06 | €0,10 | **€24,64 (82%)** |
| Business, 2 posti | €20,00 | €2,80 (2.000) | €0,79 | €0,10 | **€16,31 (82%)** |
| Business, 5 posti | €50,00 | €7,00 (5.000) | €1,60 | €0,10 | **€41,30 (83%)** |
| Pacchetto | €6,00 | €1,40 (1.000) | €0,41 | — | €4,19 (70%) |
| Prova Pro | €0 | €0,21 (150) | — | — | costo di acquisizione |

L'arrotondamento per difetto dei prezzi privati costa al massimo €0,03 per posto al mese (Pro: €6,97 netti invece di €7). Uso realistico: un utente Pro fa di norma 100–300 aggiornamenti al mese (≈ €0,28 di AI con 200), quindi il margine effettivo è più alto.

## Pareggio dei costi fissi (€60/mese)

| Scenario | Margine per cliente | Clienti necessari |
|---|---|---|
| Pro mensile, uso realistico (200 aggiornamenti) | €6,18 | **10** |
| Pro mensile, caso peggiore (800) | €5,34 | **12** |
| Pro annuale, uso realistico | €5,27 | **12** |
| Pro annuale, caso peggiore | €4,43 | **14** |
| Team da 2 posti, caso peggiore | €9,65 | 7 |
| Business da 2 posti, caso peggiore | €16,31 | 4 |

In sintesi: **circa 12 clienti Pro**, oppure un mix equivalente (es. 5 Pro + 3 Team da 2 posti ≈ €60 di margine). Il costo delle prove è trascurabile (≈ €0,21 per prova usata al massimo).

**Protezione di sicurezza:** oltre alla quota in aggiornamenti c'è un tetto tecnico di spesa pari a $0,005 per aggiornamento incluso (≈ 4× il costo medio; per il Pro $4/mese): se un uso anomalo lo raggiunge, l'AI si ferma per quel team e il lavoro manuale continua. Anche nel caso limite il Pro resta in attivo.

## Stripe: compatibile con l'account attuale

Non serve creare prezzi a mano né aggiungere variabili: bastano `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` già configurati.

1. Al primo checkout l'app crea sull'account i prodotti `boardcue_pro`, `boardcue_team`, `boardcue_business` e `boardcue_ai_credits`, e i prezzi necessari (mensile/annuale, aziende IVA esclusa, privati IVA inclusa), riconoscibili dalla lookup key (es. `boardcue_pro_month_business_700`). Se un importo cambia in `lib/plans.ts` viene creato un nuovo prezzo; gli abbonati esistenti restano sul loro.
2. `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_TEAM` e `STRIPE_PRICE_STUDIO` restano come sono: servono solo a riconoscere gli abbonamenti storici. Il vecchio `STRIPE_PRICE_TEAM` (€24 fisso) è mappato su `TEAM_LEGACY` e non viene mai usato per il nuovo Team per posto.
3. Il portale clienti usa una configurazione creata dall'app: fatture, metodo di pagamento, dati di fatturazione, disdetta a fine periodo, cambio piano e numero di posti (Team/Business da 2 a 500).
4. Stripe Tax (già attivo con `STRIPE_TAX_ENABLED=true`): per le aziende calcola l'IVA in aggiunta o l'inversione contabile con P.IVA UE; per i privati scorpora l'IVA dal prezzo finale. Se Stripe Tax fosse disattivato, i privati pagano comunque il prezzo IVA inclusa e l'IVA va scorporata in contabilità.
5. Webhook invariato su `/api/billing/webhook` con gli eventi `customer.subscription.*`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`.

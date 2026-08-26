# Deploy BoardCue AI su Coolify

Dominio canonico: `boardcue.draftapps.it`.

## Configurazione

Usa il repository e la risorsa Docker Compose esistenti. Il brand e la configurazione sono BoardCue AI.

Imposta almeno:

```env
POSTGRES_PASSWORD=UNA_PASSWORD_LUNGA_E_URL_SAFE
APP_URL=https://boardcue.draftapps.it
OPENROUTER_API_KEY=sk-or-v1-...
```

Nel servizio `app`:

1. aggiungi `https://boardcue.draftapps.it` come dominio pubblico;
2. fai puntare il proxy alla porta interna `3000`;
3. aggiorna `APP_URL` a `https://boardcue.draftapps.it`;
4. ridistribuisci;
5. dopo la verifica, rimuovi `voxboard.draftapps.it` oppure mantienilo temporaneamente solo come redirect verso `boardcue.draftapps.it`.

Il cambio hostname non richiede una migrazione del database. Tuttavia, questa versione rinomina database, utente e volume Docker in `boardcue`: una precedente installazione PlanPilot deve quindi essere esportata e importata prima della ridistribuzione, altrimenti Compose inizializzerà un database vuoto.

Da non autenticato sono disponibili home e demo pubblica. Da autenticato l’utente apre un workspace, scrive o detta un aggiornamento, BoardCue AI lo traduce in una patch strutturata, aggiorna la board e registra l’audit log.

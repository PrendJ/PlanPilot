# Deploy VoxBoard AI su Coolify

Dominio canonico: `voxboard.draftapps.it`.

## 1. Repository

In Coolify usa il repository esistente e seleziona **Docker Compose**. Il repository può mantenere il nome tecnico legacy `PlanPilot`: il brand pubblico dell'app è VoxBoard AI.

Il file `docker-compose.yml` avvia:

- `app`: Next.js / VoxBoard AI
- `db`: PostgreSQL 16 con volume persistente

Non pubblicare il servizio `db` su Internet.

## 2. Environment variables

In Coolify imposta almeno:

```env
POSTGRES_PASSWORD=UNA_PASSWORD_LUNGA_E_URL_SAFE
APP_URL=https://voxboard.draftapps.it
OPENROUTER_WORKSPACE_KEYS={"personal":"sk-or-v1-...","unguess":"sk-or-v1-..."}
```

Il browser non riceve mai il valore delle chiavi OpenRouter.

## 3. Cambio dominio

Nel servizio `app`:

1. aggiungi `https://voxboard.draftapps.it` come dominio pubblico;
2. fai puntare il proxy alla porta interna `3000`;
3. aggiorna `APP_URL` a `https://voxboard.draftapps.it`;
4. ridistribuisci il servizio mantenendo lo stesso volume PostgreSQL;
5. dopo aver verificato il nuovo hostname, rimuovi `planpilot.draftapps.io` oppure mantienilo temporaneamente solo come redirect verso il nuovo dominio.

Il cambio hostname non richiede una migrazione del database.

## 4. DNS

Crea il record DNS `voxboard` per `draftapps.it` verso lo stesso endpoint/server usato dal servizio Coolify. Se Coolify gestisce automaticamente il certificato TLS, il certificato per il nuovo hostname verrà emesso dopo che il DNS punta correttamente al server.

## 5. Primo accesso

L'app esegue automaticamente `prisma db push` all'avvio. Gli account admin possono creare utenti e gestire membership, dettatura e modelli AI dall'interfaccia.

## 6. Flusso di utilizzo

Da non autenticato è disponibile la demo interattiva pubblica.

Da autenticato:

1. apri un workspace;
2. scrivi un aggiornamento oppure registra la voce;
3. la voce viene trascritta via OpenRouter quando la dettatura è abilitata;
4. il modello riceve una versione compatta del piano corrente;
5. restituisce una patch JSON strutturata;
6. VoxBoard AI valida ID e operazioni e applica la patch in transazione;
7. la board e l'audit log vengono aggiornati;
8. il piano può essere esportato in Markdown o JSON.

## 7. Identificatori legacy

Database, volume Docker e repository possono continuare a usare internamente il nome `planpilot`. Non rinominarli durante il cambio dominio: non sono visibili all'utente e conservarli evita rischi sui dati persistenti.

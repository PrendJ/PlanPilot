# Deploy PlanPilot su Coolify

Dominio suggerito: `planpilot.draftapps.io`.

## 1. Repository

Carica questa cartella in un repository Git. In Coolify crea una nuova Resource dal repository e seleziona **Docker Compose**.

Il file `docker-compose.yml` avvia:

- `app`: Next.js / PlanPilot
- `db`: PostgreSQL 16 con volume persistente

Non pubblicare il servizio `db` su Internet.

## 2. Environment variables

In Coolify imposta almeno:

```env
POSTGRES_PASSWORD=UNA_PASSWORD_LUNGA_E_URL_SAFE
APP_URL=https://planpilot.draftapps.io
OPENROUTER_WORKSPACE_KEYS={"personal":"sk-or-v1-...","unguess":"sk-or-v1-..."}
```

`OPENROUTER_WORKSPACE_KEYS` è il modo più pratico per mantenere una chiave OpenRouter distinta per ogni workspace senza salvarla nel database e senza dover modificare il Compose a ogni nuovo workspace.

Il browser non riceve mai il valore della chiave. Nel database resta solo il nome/alias della configurazione.

### Alternativa: una env esplicita per workspace

Puoi usare anche:

```env
OPENROUTER_KEY_UNGUESS=sk-or-v1-...
OPENROUTER_KEY_TESTBIRDS=sk-or-v1-...
```

In quel caso aggiungi anche le variabili sotto `app.environment` in `docker-compose.yml` e ridistribuisci.

## 3. Dominio

Assegna il dominio pubblico al servizio `app` e fai puntare il proxy alla porta interna `3000`.

## 4. Primo deploy

Esegui il deploy. All'avvio l'app esegue automaticamente:

```bash
prisma db push
```

quindi avvia Next.js.

## 5. Crea il tuo utente con permesso multi-workspace

Apri il terminale del container `app` in Coolify ed esegui:

```bash
npm run user:create -- \
  --email tuo@email.it \
  --password 'PASSWORD_LUNGA_E_UNICA' \
  --name 'Federico' \
  --admin \
  --can-create-workspaces
```

Questo account può creare tutti i workspace necessari dall'interfaccia.

## 6. Crea gli utenti del team

Sempre dal terminale del container:

```bash
npm run user:create -- \
  --email collega@azienda.it \
  --password 'PASSWORD_LUNGA_E_UNICA' \
  --name 'Nome Collega'
```

Un utente normale non può creare workspace.

Se vuoi permetterglielo:

```bash
npm run user:create -- \
  --email collega@azienda.it \
  --password 'PASSWORD_LUNGA_E_UNICA' \
  --name 'Nome Collega' \
  --can-create-workspaces
```

## 7. Crea un workspace da terminale (opzionale)

Il tuo utente può farlo anche dalla UI. Da terminale:

```bash
npm run workspace:create -- \
  --owner tuo@email.it \
  --name 'UNGUESS' \
  --slug unguess \
  --key-env OPENROUTER_KEY_UNGUESS
```

Se usi `OPENROUTER_WORKSPACE_KEYS`, basta che esista la voce `"unguess":"sk-or-v1-..."` nella env JSON: non è necessario che `OPENROUTER_KEY_UNGUESS` esista davvero.

## 8. Aggiungi un collega a un workspace

```bash
npm run membership:add -- \
  --email collega@azienda.it \
  --workspace unguess \
  --role MEMBER
```

## 9. Flusso di utilizzo

Da non autenticato viene mostrata solo la demo.

Da autenticato:

1. apri un workspace;
2. scrivi un aggiornamento nella chat in alto oppure registra la voce;
3. la voce viene trascritta via OpenRouter;
4. il modello riceve una versione compatta del piano corrente;
5. restituisce una patch JSON strutturata;
6. PlanPilot valida ID e operazioni e applica la patch in transazione;
7. la board e l'audit log vengono aggiornati;
8. il piano può essere esportato in Markdown o JSON.

## 10. Modelli predefiniti

- aggiornamento piano: `openai/gpt-5-nano`
- trascrizione: `openai/gpt-4o-mini-transcribe`

Sono memorizzati a livello di workspace e possono essere cambiati successivamente senza cambiare l'architettura.

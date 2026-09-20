# BoardCue AI

AI-first, voice-powered Trello-style planning board. Users describe what changed in text or voice; the backend sends the current compact plan to OpenRouter and applies only validated structured mutations.

## Public URL

Canonical hostname: `boardcue.draftapps.it`.

Public demo: `https://boardcue.draftapps.it/demo`.

## What is included

- public interactive demo
- verified email/password accounts, reset and session revocation
- organizations, explicit workspace memberships and OWNER/ADMIN/MEMBER roles
- five copied presets in seven languages and 1–12 customizable shared columns
- manual card CRUD, multi-assignees, due dates, priority, tags, filters, archive and restore
- structured AI patches instead of full-plan rewrites
- browser audio recording and OpenRouter transcription
- manual drag & drop fallback
- revision-based conflict protection, AI audit log and undo
- ZDR/no-training AI routing with no privacy-degrading fallback
- Stripe monthly plans, quotas, trial and Enterprise lead flow
- superadmin control room with lifetime-free entitlements and economics drill-down
- JSON and Markdown export
- Docker Compose with PostgreSQL, ready for Coolify

## Coolify

Use this repository as the existing Docker Compose resource, assign `https://boardcue.draftapps.it` to service `app` on port 3000 and set:

```env
APP_URL=https://boardcue.draftapps.it
POSTGRES_PASSWORD=...
OPENROUTER_API_KEY=...
OPENROUTER_WORKSPACE_KEYS={"workspace-slug":"sk-or-v1-..."}
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
# Stripe Price IDs, e.g. price_1AbCdEfGhIjKlMnOp (not numeric amounts)
STRIPE_PRICE_SOLO=...
STRIPE_PRICE_TEAM=...
STRIPE_PRICE_STUDIO=...
SMTP_HOST=...
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=...
SALES_EMAIL=...
SALES_BOOKING_URL=...
CRON_SECRET=...
```

Configura inoltre una chiamata `POST` ogni ora a `https://boardcue.draftapps.it/api/cron/retention`, con header `Authorization: Bearer <CRON_SECRET>`. Il job gestisce i promemoria di verifica email, la rimozione degli account non verificati, le scadenze della prova gratuita e la retention.

For an existing database previously managed with `prisma db push`, take and verify a backup, then baseline only the legacy migration once before deployment:

```sh
npx prisma migrate resolve --applied 0001_legacy_baseline
npx prisma migrate deploy
```

Fresh databases run both migrations automatically. Never run `migrate resolve` on a fresh database.

## Provisioning da terminale

Per creare un utente già abilitato all'accesso, con un'organizzazione personale:

```sh
npm run user:create -- --email persona@example.com --password 'PASSWORD_LUNGA_E_UNICA' --name 'Nome Cognome'
```

Per assegnare un piano alla sua organizzazione, con scadenza facoltativa:

```sh
npm run license:grant -- --email persona@example.com --plan TEAM --expires-at 2026-12-31 --actor superadmin@example.com
```

Piani disponibili: `TRIAL`, `SOLO`, `TEAM`, `STUDIO`, `LIFETIME`, `ENTERPRISE`. Se la persona possiede più organizzazioni, aggiungi `--organization slug-organizzazione`. Le licenze manuali prevalgono su Stripe fino alla revoca o alla scadenza.

Per promuovere un account esistente a Superadmin, verificarne l'email e riattivarlo senza cambiare la password:

```sh
npm run user:promote-superadmin -- --email persona@example.com
```

Per inserire una persona già creata in un workspace, il comando aggiunge anche la membership dell'organizzazione e rispetta il limite del piano:

```sh
npm run membership:add -- --email persona@example.com --workspace progetto-cliente --role MEMBER
```

## AI model strategy

The canonical plan remains relational data in PostgreSQL. The LLM returns a small schema-validated patch (`create`, `update`, `move`, `archive`), and the backend validates referenced IDs before applying it transactionally. Provider names, keys and monetary cost are not exposed in customer APIs.

## Local verification and write safety

Run `npm test`, `npm run typecheck` and `npm run build`. Unit/handler tests use synthetic data and mocked provider calls. PostgreSQL integration tests are skipped unless `BOARDCUE_TEST_DATABASE_URL` points to a disposable local `boardcue_test_*` database with the existing migrations applied; see [acceptance coverage and setup](docs/AI_ACCEPTANCE_2026-09-19.md).

Board mutations must call `assertRevision` with the current actor **inside the same transaction** as the writes and `bumpRevision`. The guard locks the board and access rows until commit and rechecks membership, role and lifecycle. Never call it with the root Prisma client or bypass it in a new card/column mutation. AI batches are validated in full before writing; invalid targets fail the whole batch.

The existing AI flow still applies on submission. Preview, explicit confirmation and idempotent receipts remain release requirements for the proposed new flow. Read the [19 September audit](docs/AUDIT_2026-09-19.md) for verified findings, remaining risks, tests and rollback; this increment is not a production release.

## Installable app and optional project notifications

The **App** button offers installation guidance, explicit app updates and opt-in project notifications. Build generates the service worker; it caches public assets and a generic offline page, never private pages or API responses. Project access still requires a connection. App updates are blocked while board drafts or edits are open.

Web Push is disabled by default and requires VAPID configuration, the additive `0010_web_push` migration and a once-per-minute `node scripts/dispatch-notifications.mjs` job inside the app container. Logout removes subscriptions. See [configuration, verified tests, platform limits and rollback](docs/PWA_NOTIFICATIONS_2026-09-20.md) before enabling it. No deployment is performed by committing these changes.

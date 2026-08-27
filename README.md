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

Per inserire una persona già creata in un workspace, il comando aggiunge anche la membership dell'organizzazione e rispetta il limite del piano:

```sh
npm run membership:add -- --email persona@example.com --workspace progetto-cliente --role MEMBER
```

## AI model strategy

The canonical plan remains relational data in PostgreSQL. The LLM returns a small schema-validated patch (`create`, `update`, `move`, `archive`), and the backend validates referenced IDs before applying it transactionally. Provider names, keys and monetary cost are not exposed in customer APIs.

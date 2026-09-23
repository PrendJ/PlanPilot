# BoardCue

Voice-first planning board. People dictate or type what changed; an AI reached through OpenRouter (zero data retention providers only) proposes a minimal, validated patch, shows it as a preview, and applies it only when confirmed. Every change is attributed, visible in the activity log and undoable.

## Public URL

Canonical hostname: `boardcue.draftapps.it`.

Public demo: `https://boardcue.draftapps.it/demo`.

## What is included

- landing (IT + `/en`), interactive public demo (same preview/apply loop, simulated locally), pricing with seats and annual billing
- instant sign-up with a ready-made starter board; 7-day window to verify the email; magic-link sign-in
- two-step verification (TOTP authenticator apps, recovery codes) on every plan; enforceable per team on Business
- AI loop: immutable proposals with diff preview, partial apply, clarification questions, idempotent receipts, 15-minute expiry, undo
- dictation in 7 languages with live level meter, timer, cancel and 2-minute limit (included in every plan)
- real-time boards (Server-Sent Events) with per-card optimistic concurrency
- cards with due dates, overdue states, checklists, assignees, comments and @mentions; kanban, list and calendar views
- notifications (in-app bell, daily email digest, due-date reminders, optional Web Push)
- invites with pending list, resend/revoke, free guest role (read + comment)
- import from Trello JSON / CSV; export CSV, JSON, Markdown, print
- personal API tokens (`/api/v1`) and signed outgoing webhooks (JSON or Slack/Teams text)
- plans: Pro trial (14 days), Pro, Team and Business (per seat, minimum 2), Enterprise; AI updates quota with atomic reservation and credit packs; frozen (read-only) instead of deleted on non-payment
- Italian e-invoicing data collection at checkout and fiscal CSV export for the back office
- superadmin back office with economics per seat, activation KPIs (aggregate, privacy-preserving) and licensing
- design system "Paper/Graphite" (WCAG AA), Geist fonts, BoardCue mark, installable PWA with quick-voice shortcut
- Docker Compose with PostgreSQL, ready for Coolify; health endpoint, backup/restore scripts, smoke-test workflow

See [the commercial assessment and implementation map](docs/VALUTAZIONE_COMMERCIALE_2026-09-23.md), [pricing and unit economics](docs/PRICING_ECONOMICS.md) and [operations](docs/OPERATIONS.md).

## Coolify

Use this repository as the existing Docker Compose resource, assign `https://boardcue.draftapps.it` to service `app` on port 3000 and set:

```env
APP_URL=https://boardcue.draftapps.it
POSTGRES_PASSWORD=...
OPENROUTER_API_KEY=...
OPENROUTER_WORKSPACE_KEYS={"workspace-slug":"sk-or-v1-..."}
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
# Current plans need no Price IDs (created automatically from lib/plans.ts).
# Keep the previous flat prices only to recognise existing subscribers:
STRIPE_PRICE_SOLO=...
STRIPE_PRICE_TEAM=...
STRIPE_PRICE_STUDIO=...
APP_ENCRYPTION_KEY=...
LEGAL_ENTITY_NAME=...
LEGAL_VAT_NUMBER=...
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

Piani disponibili: `TRIAL`, `PRO`, `TEAM`, `BUSINESS`, `LIFETIME`, `ENTERPRISE` (più `SOLO`, `TEAM_LEGACY` e `STUDIO` storici). Se la persona possiede più organizzazioni, aggiungi `--organization slug-organizzazione`. Le licenze manuali prevalgono su Stripe fino alla revoca o alla scadenza.

Per promuovere un account esistente a Superadmin, verificarne l'email e riattivarlo senza cambiare la password:

```sh
npm run user:promote-superadmin -- --email persona@example.com
```

Per inserire una persona già creata in un workspace, il comando aggiunge anche la membership dell'organizzazione e rispetta il limite del piano:

```sh
npm run membership:add -- --email persona@example.com --workspace progetto-cliente --role MEMBER
```

## AI model strategy

The canonical plan remains relational data in PostgreSQL. The LLM returns a small schema-validated patch (`create`, `update`, `move`, `archive`) or a clarification; the backend validates every referenced ID, stores it as a proposal and applies it transactionally only on confirmation, checking that the touched cards have not changed since. Requests go through OpenRouter to zero-retention provider endpoints only, with data collection denied; the default model is Gemini 2.5 Flash-Lite and dictation uses Voxtral Mini (`lib/ai-config.ts`). Provider names, keys and monetary cost are not exposed in customer APIs. Quality is measured with the 200-case evaluation set (`scripts/ai-eval.ts`).

## Local verification and write safety

Run `npm test`, `npm run typecheck` and `npm run build`. Unit/handler tests use synthetic data and mocked provider calls. PostgreSQL integration tests are skipped unless `BOARDCUE_TEST_DATABASE_URL` points to a disposable local `boardcue_test_*` database with the existing migrations applied; see [acceptance coverage and setup](docs/AI_ACCEPTANCE_2026-09-19.md).

Board mutations must call `assertBoardAccess` (or `assertRevision` for board-wide batches) with the current actor **inside the same transaction** as the writes and `bumpRevision`; card edits also claim the card `version` (`claimCardVersion`). The guard locks the board and access rows until commit and rechecks membership, role and lifecycle. Never call it with the root Prisma client or bypass it in a new card/column mutation. AI batches are validated in full before writing; invalid targets fail the whole batch.

The AI flow now previews every change and applies it only on confirmation, with idempotent receipts (see [the 23 September assessment](docs/VALUTAZIONE_COMMERCIALE_2026-09-23.md)). The [19 September audit](docs/AUDIT_2026-09-19.md) documents the earlier write safeguards.

## Installable app and optional project notifications

The **App** button offers installation guidance, explicit app updates and opt-in project notifications. Build generates the service worker; it caches public assets and a generic offline page, never private pages or API responses. Project access still requires a connection. App updates are blocked while board drafts or edits are open.

Web Push is disabled by default and requires VAPID configuration, the additive `0010_web_push` migration and a once-per-minute `node scripts/dispatch-notifications.mjs` job inside the app container. Logout removes subscriptions. See [configuration, verified tests, platform limits and rollback](docs/PWA_NOTIFICATIONS_2026-09-20.md) before enabling it. No deployment is performed by committing these changes.

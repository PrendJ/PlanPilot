# PlanPilot

AI-first Trello-style planning board. Users describe what changed in text or voice; the backend sends the current compact plan to OpenRouter and applies only validated structured mutations.

## What is included

- public read-only demo when logged out
- email/password login; accounts are created from terminal only
- multiple workspaces with memberships and roles
- `canCreateWorkspaces` permission for users who may create more boards
- separate OpenRouter key per workspace, resolved server-side from environment variables
- default board states: Inbox, Next, In progress, Waiting, Done, Parked
- natural-language updates converted to structured JSON patches using OpenRouter Structured Outputs
- audio recording and OpenRouter transcription
- manual drag & drop fallback
- AI activity/audit log and per-call cost when returned by OpenRouter
- JSON and Markdown export
- Docker Compose with PostgreSQL, ready for Coolify

## Local start with Docker Compose

```bash
cp .env.example .env
# edit .env
docker compose up -d --build

docker compose exec app npm run user:create -- \
  --email you@example.com \
  --password 'use-a-long-password' \
  --name 'Your name' \
  --admin \
  --can-create-workspaces

docker compose exec app npm run workspace:create -- \
  --owner you@example.com --name 'Personal' --slug personal
```

If you run Next directly instead of Compose, install dependencies and set `DATABASE_URL` to an available PostgreSQL database before `npm run db:push` / `npm run dev`.

## Create your owner account

This gives your own account permission to create multiple workspaces:

```bash
npm run user:create -- \
  --email YOUR_EMAIL \
  --password 'LONG_RANDOM_PASSWORD' \
  --name 'Federico' \
  --admin \
  --can-create-workspaces
```

The command is an upsert, so running it again updates the password/permissions.

## Create normal team users

```bash
npm run user:create -- --email teammate@company.com --password 'LONG_RANDOM_PASSWORD' --name 'Teammate'
```

Normal users cannot create workspaces unless you add `--can-create-workspaces`.

## Create a workspace

```bash
npm run workspace:create -- \
  --owner YOUR_EMAIL \
  --name 'UNGUESS' \
  --slug unguess \
  --key-env OPENROUTER_KEY_UNGUESS
```

Then add members:

```bash
npm run membership:add -- --email teammate@company.com --workspace unguess --role MEMBER
```

## OpenRouter secrets

The browser never receives an API key. `Workspace.openrouterKeyEnv` stores only an environment-variable name.

Two server-side modes are supported:

### Recommended on Coolify: one secret JSON map

```env
OPENROUTER_WORKSPACE_KEYS={"personal":"sk-or-v1-...","unguess":"sk-or-v1-...","testbirds":"sk-or-v1-..."}
```

Each workspace still has a distinct OpenRouter key, but adding a workspace does not require changing `docker-compose.yml`.

### Explicit environment variables

```env
OPENROUTER_KEY_UNGUESS=sk-or-v1-...
OPENROUTER_KEY_TESTBIRDS=sk-or-v1-...
```

When deploying via Docker Compose, also pass each explicit key under `app.environment` in `docker-compose.yml`. PlanPilot checks the explicit variable first, then falls back to the JSON map by workspace slug.

## Coolify deployment

Suggested hostname: `planpilot.draftapps.io`.

1. Push this folder to a Git repository.
2. In Coolify create a new Resource from the repository and choose Docker Compose.
3. Set the public domain of service `app` to `https://planpilot.draftapps.io:3000` (or configure the service/domain UI so the proxy targets port 3000).
4. Configure runtime environment variables:
   - `POSTGRES_PASSWORD`
   - `APP_URL=https://planpilot.draftapps.io`
   - `OPENROUTER_WORKSPACE_KEYS=...`
5. Deploy. The container runs `prisma db push` before starting Next.
6. Open a terminal in the running `app` container and create the first user/workspace with the commands above.

Do not expose the database service publicly.

## AI model strategy

Default plan model: `openai/gpt-5-nano`.
Default transcription model: `openai/gpt-4o-mini-transcribe`.

The canonical plan is relational data in PostgreSQL. The LLM does **not** rewrite the entire plan. It returns a small schema-validated patch (`create`, `update`, `move`, `archive`) and the backend validates referenced IDs before applying it transactionally.

This lowers token usage and makes accidental corruption much less likely.

## Production hardening after MVP

Recommended next steps:

- add CSRF protection for mutation endpoints if the app is exposed broadly
- rate-limit login, transcription and AI ingestion routes
- add password reset / forced password rotation if team size grows
- add optimistic-concurrency/version checks if multiple users update the same board heavily
- add workspace settings UI for model selection and prompt policy
- add an optional review mode (`AI proposes -> user approves`) for sensitive workspaces
- add backups for the PostgreSQL volume

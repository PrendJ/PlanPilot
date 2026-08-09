# VoxBoard AI

AI-first, voice-powered Trello-style planning board. Users describe what changed in text or voice; the backend sends the current compact plan to OpenRouter and applies only validated structured mutations.

## What is included

- public interactive demo when logged out
- email/password login with admin user management from the UI
- multiple workspaces with memberships and roles
- `canCreateWorkspaces` permission for users who may create more boards
- separate OpenRouter key per workspace, resolved server-side from environment variables
- per-workspace model selection and dictation enable/disable
- default board states: Inbox, Next, In progress, Waiting, Done, Parked
- natural-language updates converted to structured JSON patches using OpenRouter Structured Outputs
- audio recording and OpenRouter transcription
- manual drag & drop fallback
- AI activity/audit log and per-call cost when returned by OpenRouter
- JSON and Markdown export
- Docker Compose with PostgreSQL, ready for Coolify

## Public URL

Canonical hostname: `voxboard.draftapps.it`.

Public demo: `https://voxboard.draftapps.it/demo`.

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

## OpenRouter secrets

The browser never receives an API key. `Workspace.openrouterKeyEnv` stores only an environment-variable name.

Recommended on Coolify:

```env
OPENROUTER_WORKSPACE_KEYS={"personal":"sk-or-v1-...","unguess":"sk-or-v1-...","testbirds":"sk-or-v1-..."}
```

Each workspace can still have a distinct OpenRouter key without changing `docker-compose.yml` for every new board.

## Coolify deployment

1. Use this repository as a Docker Compose resource.
2. Assign the public domain of service `app` to `https://voxboard.draftapps.it` and proxy it to port `3000`.
3. Configure runtime environment variables:
   - `POSTGRES_PASSWORD`
   - `APP_URL=https://voxboard.draftapps.it`
   - `OPENROUTER_WORKSPACE_KEYS=...`
4. Deploy. The container runs `prisma db push` before starting Next.
5. Keep the existing PostgreSQL volume/database during the hostname change; no data migration is required.

Do not expose the database service publicly.

## Internal identifiers

The GitHub repository, PostgreSQL database name/user and Docker volume may still contain the legacy `planpilot` identifier. They are intentionally retained as internal technical identifiers to avoid breaking the current deployment and persistent data. Public branding and URLs use VoxBoard AI.

## AI model strategy

Plan and transcription models are configurable per workspace from the admin interface. The canonical plan remains relational data in PostgreSQL. The LLM does not rewrite the entire plan: it returns a small schema-validated patch (`create`, `update`, `move`, `archive`) and the backend validates referenced IDs before applying it transactionally.

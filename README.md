# BoardCue AI

AI-first, voice-powered Trello-style planning board. Users describe what changed in text or voice; the backend sends the current compact plan to OpenRouter and applies only validated structured mutations.

## Public URL

Canonical hostname: `boardcue.draftapps.it`.

Public demo: `https://boardcue.draftapps.it/demo`.

## What is included

- public interactive demo
- email/password login with admin user management
- multiple workspaces with memberships and roles
- per-workspace OpenRouter keys, planning/transcription models and dictation toggle
- Inbox, Next, In progress, Waiting, Done and Parked
- structured AI patches instead of full-plan rewrites
- browser audio recording and OpenRouter transcription
- manual drag & drop fallback
- AI audit log and cost when returned by OpenRouter
- JSON and Markdown export
- Docker Compose with PostgreSQL, ready for Coolify

## Coolify

Use this repository as the existing Docker Compose resource, assign `https://boardcue.draftapps.it` to service `app` on port 3000 and set:

```env
APP_URL=https://boardcue.draftapps.it
POSTGRES_PASSWORD=...
OPENROUTER_WORKSPACE_KEYS={"personal":"sk-or-v1-..."}
```

Keep the existing PostgreSQL database and volume. The GitHub repository, PostgreSQL database/user and Docker volume may retain the legacy `planpilot` identifier: these are internal technical identifiers and renaming them would add migration risk without user benefit.

## AI model strategy

Plan and transcription models are configurable per workspace. The canonical plan remains relational data in PostgreSQL. The LLM returns a small schema-validated patch (`create`, `update`, `move`, `archive`), and the backend validates referenced IDs before applying it transactionally.

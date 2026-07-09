# Folio IA

Folio is a GitHub-native web app for reviewing pull requests as ordered,
logical chapters instead of a flat file list.

## Product Goal

Help reviewers understand large PRs quickly:

1. Ingest a GitHub PR.
2. Split changed files into review chapters.
3. Show the PR as a guided review flow.
4. Track review progress per chapter and file.
5. Later, sync important review state back to GitHub.

## MVP Flow

```txt
GitHub App installed
→ PR webhook received
→ backend stores/fetches PR context
→ decomposition creates chapters
→ dashboard lists reviewable PRs
→ reviewer opens PR
→ reviewer reads chapters in order
→ reviewer marks chapters/files viewed
```

OAuth user login is not required for the first local MVP. The first priority is
the GitHub App ingestion path and the chapter viewer. OAuth can be added once
real per-user review state is needed.

## Navigation

```txt
Folio
├─ Dashboard
├─ Pull Request Review
├─ Onboarding / GitHub App Install
├─ Settings
└─ Error / Empty States
```

## Pull Request Review

The PR view is chapter-first.

```txt
PR header
├─ repo / PR number / title / author / branch context
├─ GitHub link
└─ overall progress

Chapter list
├─ ordered chapter titles
├─ files touched
├─ risk/status hints
└─ viewed state

Review pane
├─ PR or chapter summary
├─ what to double-check
├─ focused diff
└─ mark viewed actions
```

## Backend API Shape

All responses use the shared envelope:

```json
{ "success": true, "data": {} }
```

```json
{
  "success": false,
  "error": { "code": "invalid_signature", "message": "..." },
  "path": "/webhooks/github",
  "timestamp": "2026-06-20T00:00:00.000Z"
}
```

Current routes:

```txt
GET  /health
GET  /api/v1/pulls
GET  /api/v1/pulls/:id/chapters
POST /webhooks/github
```

## Architecture

Backend layers follow the clean layered structure:

```txt
interfaces     controllers, API response envelope, exception filters
application    facade/use-case orchestration
domain         business rules and models
infrastructure external adapters such as GitHub helpers
internal       logging and reusable internal modules
support        shared errors and support code
```

Frontend is a Next.js App Router app with a mock dashboard and PR viewer. Real
API calls should go through `apps/web/src/lib/api-client.ts`.

## Profiles

Local development is explicit:

- backend: `APP_PROFILE=dev`, `PORT=8080`, `WEB_ORIGIN=http://localhost:5173`,
  `PUBLIC_API_BASE_URL=http://localhost:8080`,
  `FOLIO_WEB_BASE_URL=http://localhost:5173`, `SUPABASE_DATABASE_URL=<supabase-db-url>`
- frontend: `APP_PROFILE=dev`, `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`

Production uses:

- backend/frontend: `APP_PROFILE=prd`

`prd` must provide a real Supabase database, GitHub App, public URL, and web URL
secrets. Dev and production both use `SUPABASE_DATABASE_URL`; local Postgres is
not part of the runtime profile.

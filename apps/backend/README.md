# @folio/backend

The always-on Folio backend: a NestJS server that hosts the
GitHub App (webhooks → decompose → bot comment/Check Run) and the REST API
consumed by the Next.js review UI.

## Run

From the repo root:

```bash
pnpm dev:backend
pnpm worker          # review + PR-index backfill/reconcile
# optional explicit migrate (also runs automatically on backend/worker boot):
pnpm db:migrate
```

Or from this package:

```bash
pnpm dev      # APP_PROFILE=dev + tsx watch src/index.ts (runs Drizzle migrate first)
pnpm build    # tsc -> dist/
pnpm start    # APP_PROFILE=prd + node dist/index.js
pnpm worker   # APP_PROFILE=dev worker (migrate + enqueue not-ready index backfills)
```

**Database:** backend and worker call `runMigrations()` on boot, so new SQL under
`packages/db/drizzle/` is applied when processes start (idempotent). You do not
need a separate manual migrate for normal dev/deploy if processes restart after
pull. `DASHBOARD_READ_FROM_INDEX` defaults to `true` (ready repos only); set
`false` to roll back to live GitHub lists.

The server listens on `PORT` (default `8080`). Verify it is up:

```bash
curl http://localhost:8080/health
# -> { "success": true, "data": { "status": "ok", "service": "folio-backend", "ts": "..." } }
```

## Routes (skeleton)

- `GET /` — service banner
- `GET /health` — health check
- `GET /api/v1/pulls` — list in-flight PRs (stub, TODO B2)
- `GET /api/v1/pulls/:id/chapters` — chapters + prologue for a PR (stub, TODO B2)
- `POST /webhooks/github` — GitHub App webhook receiver (202; TODO I1)

## Configuration

Environment is parsed and validated in `src/config.ts` (see `.env.example` at
the repo root). Runtime profile is selected with `APP_PROFILE=dev|prd`.
Values are loaded from the repo root `.env`. Key vars: `APP_PROFILE`, `PORT`,
`WEB_ORIGIN`, `PUBLIC_API_BASE_URL`, `FOLIO_WEB_BASE_URL`, `SUPABASE_DATABASE_URL`,
`FOLIO_DECOMP_MODEL`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
`GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, and
`GITHUB_APP_CLIENT_SECRET`.
Decomposition runs through the Codex SDK.

Set `SUPABASE_DATABASE_URL` to the Supabase database connection string for both
dev and production. Supabase API keys are not required for Folio's Drizzle
migrations or SQL queries.

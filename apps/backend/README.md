# @folio/backend

The always-on Folio backend: a NestJS server that hosts the
GitHub App (webhooks → decompose → bot comment/Check Run) and the REST API
consumed by the Next.js review UI.

## Run

From the repo root:

```bash
pnpm dev:backend
```

Or from this package:

```bash
pnpm dev      # APP_PROFILE=dev + tsx watch src/index.ts
pnpm build    # tsc -> dist/
pnpm start    # APP_PROFILE=prd + node dist/index.js
pnpm worker   # APP_PROFILE=dev decomposition worker (stub)
```

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
Common values are loaded from `.env`, then profile-specific values from
`.env.dev` or `.env.prd`. Key vars: `APP_PROFILE`, `PORT`, `WEB_ORIGIN`,
`DATABASE_URL`, `FOLIO_DECOMP_MODEL`, `FOLIO_DECOMP_LLM`, `GITHUB_APP_ID`,
`GITHUB_APP_WEBHOOK_SECRET`. Decomposition runs through the Codex SDK, which
authenticates via the local Codex CLI session (`~/.codex`) — no API key env var.

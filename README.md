# Folio

Folio is a GitHub-native PR review app that turns a large pull request into
ordered review chapters. The current MVP focuses on GitHub App ingestion, PR
chapter generation, and a chapter-first web review UI.

## Apps

```txt
apps/backend   NestJS API + GitHub App webhook server
apps/web       Next.js review UI
packages/*     shared GitHub, diff, db, decomposition, and type modules
```

## Local Development

```bash
pnpm install
cp .env.example .env
pnpm db:up

pnpm dev:backend   # http://localhost:8080
pnpm dev:web       # http://localhost:5173
```

In an Orca workspace this is automated by `orca.yaml`: `scripts.setup` runs
`pnpm install` + `.env` bootstrap + `pnpm db:up` when the workspace is created, and
`defaultTabs` auto-opens the db, backend, web, and a shell tab on activation.

Profiles are explicit:

- `APP_PROFILE=dev|prd` for the backend and web app.
- `.env` is the single local env file, copied from `.env.example`.

The backend returns all API responses in a common envelope:

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "error": { "code": "invalid_signature", "message": "..." } }
```

## Useful Commands

```bash
pnpm --filter @folio/backend test
pnpm typecheck
pnpm build
```

## Current MVP Scope

- GitHub App webhook receiver.
- PR list/chapter API skeleton.
- Chapter-first PR review UI mock.
- Shared API response and error handling.
- Local `dev` and `prd` profile separation.

## License

MIT.

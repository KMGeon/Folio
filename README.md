# Folio

[![Deploy](https://github.com/KMGeon/Folio/actions/workflows/deploy.yml/badge.svg)](https://github.com/KMGeon/Folio/actions/workflows/deploy.yml)
[![Release](https://img.shields.io/badge/release-v0.1.0-0e8a16)](https://github.com/KMGeon/Folio/releases/tag/v0.1.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.32.1-f69220)](https://pnpm.io/)
[![Next.js](https://img.shields.io/badge/Next.js-App%20Router-000000)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-API-e0234e)](https://nestjs.com/)

Folio is a GitHub-native pull request review tool. It turns a large PR into
ordered, logical review chapters so reviewers can inspect related changes in the
right sequence instead of reading one long diff.

Production site: [https://folio.ai.kr](https://folio.ai.kr)

## What Folio Does

- Ingests GitHub App webhooks and pull request data.
- Generates review chapters from changed files, commits, comments, and PR context.
- Shows a dense, chapter-first review UI for authenticated GitHub users.
- Keeps authorization GitHub-native: users can only open reviews for repositories
  they can access on GitHub.
- Deploys from `main` to EC2 through GitHub Actions, Docker Compose, and Nginx.

## Repository Layout

```txt
apps/backend   NestJS API, GitHub App webhook receiver, worker orchestration
apps/web       Next.js App Router review UI
packages/db    Drizzle/Postgres schema and repositories
packages/diff  Diff parsing and hunk coverage
packages/github GitHub App, OAuth, and Octokit helpers
packages/decomposition PR chapter generation engine
packages/types Shared Zod API and domain types
```

## Local Development

Prerequisites:

- Node.js 20+
- pnpm 10.32.1
- Docker, for the local Postgres profile
- Codex CLI login if `FOLIO_DECOMP_LLM=1` and `OPENAI_API_KEY` is not set

```bash
pnpm install
cp .env.example .env
pnpm db:up

pnpm dev:backend   # http://localhost:8080
pnpm dev:web       # http://localhost:5173
```

The backend returns every API response in a common envelope:

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "error": { "code": "invalid_signature", "message": "..." } }
```

## Runtime Profiles

Folio keeps local and production configuration explicit.

| Runtime | Variable      | Values         |
| ------- | ------------- | -------------- |
| Backend | `APP_PROFILE` | `dev` or `prd` |
| Web     | `APP_PROFILE` | `dev` or `prd` |

Local defaults are in `.env.example`. Production must provide real values for:

- `DATABASE_URL`
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_WEBHOOK_SECRET`
- `GITHUB_APP_SLUG`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `PUBLIC_API_BASE_URL`
- `FOLIO_WEB_BASE_URL`
- `NEXT_PUBLIC_API_BASE_URL`

For PR decomposition, Folio can use Codex, an Ollama-compatible fallback, and a
deterministic fallback. See `.env.example` for `FOLIO_DECOMP_*` settings.

## Deployment

Deployment is managed by `.github/workflows/deploy.yml`.

1. Push to `main` or run the workflow manually.
2. GitHub Actions runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
3. The workflow syncs the repository to the EC2 deploy path.
4. The server runs `docker compose up -d --build --remove-orphans`.
5. Nginx routes `folio.ai.kr` traffic to the backend on `8080` and the web app on
   `5173`.

Required GitHub Actions secrets:

- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_KEY`
- `DEPLOY_PATH`

The EC2 host must keep its production `.env` file on the server. The deployment
sync excludes `.env` and `.env.*`.

## Verification

Run the same checks used by CI before merging or deploying:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## GitHub Labels

Issue and PR labels use these groups:

- `area:*` for the affected subsystem, such as `area:web`, `area:backend`,
  `area:github`, `area:db`, `area:diff`, `area:engine`, `area:types`, and
  `area:infra`.
- `type:*` for the work kind, such as `type:feature`, `type:fix`, `type:docs`,
  `type:ops`, and `type:test`.
- `release:included` for work that should appear in the next release note.
- `size:*` for review size.

## Latest Release

The first production MVP release is `v0.1.0`.

| Author | Change                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| KMGeon | Targeted the production domain and Nginx deploy path for `folio.ai.kr`.                                                              |
| KMGeon | Added EC2 deployment through GitHub Actions.                                                                                         |
| KMGeon | Removed the dashboard activity area for a leaner review flow.                                                                        |
| KMGeon | Improved review rendering for GitHub comment avatars, markdown tables, nested activity, prologue comments, and inline diff comments. |
| KMGeon | Expanded the GitHub App based review dashboard and synchronization flow.                                                             |
| KMGeon | Guarded backend review creation when commit fetches fail.                                                                            |

Full release history is available in [GitHub Releases](https://github.com/KMGeon/Folio/releases).

## Support

For policy or production support, contact `support.foliodev@gmail.com`.

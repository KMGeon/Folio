# AGENTS.md

## Project Shape

Folio is a GitHub-native PR-review tool — it splits one pull request into ordered,
logical review **chapters**. It is a pnpm + TypeScript ESM monorepo.

- `apps/web`: Next.js App Router review UI (dark-mode only).
- `apps/backend`: NestJS API + GitHub App webhook/worker server.
- `packages/*`: shared db, diff, GitHub, decomposition, and type modules.

Folio is a pure GitHub-data tool — it never touches the local machine, so there is
no Electron, SSH, or multi-git-provider concern. Use the repo root as the working
directory for commands unless a package-specific command is required.

## Docs

Long-form documentation lives in `docs/`. Keep `.claude` / `.codex` thin (skills
and agents only) and put durable knowledge in `docs/`. Key references:

- [`docs/design-system.md`](./docs/design-system.md) — dark theme tokens, typography, components.
- [`docs/lint.md`](./docs/lint.md) — oxlint/oxfmt/husky stack + backend & frontend rules.
- [`docs/folio-ia.md`](./docs/folio-ia.md) — product goal, MVP flow, navigation, API shape.

## Design System

All UI work — layout, color, typography, spacing, component selection, UX behavior —
must follow [`docs/design-system.md`](./docs/design-system.md). Use the OKLCH tokens
defined in `apps/web/src/app/globals.css` (the canonical source) and the shadcn
primitives in `apps/web/src/components/ui/`. Don't invent new color values, font
sizes, or shadow tiers when a documented token already covers the role. Folio is
**dark-mode only**; keep the UI dense and chapter-review focused.

## Backend Architecture

Follow the clean layered structure in `apps/backend/src`:

- `interfaces`: controllers, API response envelope, exception filters.
- `application`: facades and use-case orchestration.
- `domain`: business rules and domain models.
- `infrastructure`: external adapters (GitHub, db, model).
- `internal`: reusable internal modules such as logging.
- `support`: shared errors and support code.

All API responses must use the common response envelope.

## Frontend

Prefer existing components and tokens in `apps/web/src`. API calls go through
`apps/web/src/lib/api-client.ts`. Sample/mock data lives in `lib/sample-review.ts`;
when swapping in real backend data, keep the visual structure identical.

## Profiles

Keep runtime profiles explicit.

- Backend: `APP_PROFILE=dev|prd`.
- Frontend: `NEXT_PUBLIC_APP_PROFILE=dev|prd`.
- Local dev ports are backend `8080` and frontend `5173`.
- `prd` must provide real database, GitHub App, and model secrets.
- Do not commit real `.env`, `.env.dev`, or `.env.prd` files.

## Code Comments: Document the "Why", Briefly

When writing or modifying code driven by a design doc or non-obvious constraint, add
a comment explaining **why** the code behaves the way it does.

Keep comments short — one or two lines. Capture only the non-obvious reason (safety
constraint, compatibility shim, design-doc rule). Don't restate what the code does,
narrate the mechanism, cite design-doc sections verbatim, or explain adjacent API
choices unless they're the point.

## File and Module Naming

Never use vague names like `helpers`, `utils`, `common`, `misc`, or `shared-stuff`
for files, folders, or modules. They carry zero info and become dumping grounds.
Name files after what they _actually_ contain — prefer the concrete domain concept
(e.g. `chapter-coverage.ts`, `webhook-signature.ts`) over the generic role
(`review-helpers.ts`, `github-utils.ts`). If you reach for `helpers`, the file
probably has more than one responsibility and should be split.

## Type Declarations: Prefer `.ts` Over `.d.ts`

Author shared types as real `.ts` modules (the `@folio/types` Zod spine), not loose
`.d.ts` ambient declarations. Reserve `.d.ts` for typing third-party modules that
ship none.

## Lint & Format

The repo uses **oxlint** + **oxfmt**, enforced on commit via husky + lint-staged.
Full rules (shared, backend, frontend) are in [`docs/lint.md`](./docs/lint.md). Two
hard rules: never add a `max-lines` disable (split the file instead), and never
bypass the pre-commit hook with `--no-verify`.

## Verification

Before preparing changes for push, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

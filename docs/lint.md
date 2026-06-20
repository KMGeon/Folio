# Lint & Format

Folio uses one fast Rust toolchain across the whole monorepo: **oxlint** for
linting and **oxfmt** for formatting, enforced automatically on commit via
**husky** + **lint-staged**. There is no ESLint, Prettier, or Biome — do not add
them. Config lives at the repo root: [`.oxlintrc.json`](../.oxlintrc.json) and the
`lint-staged` block in [`package.json`](../package.json).

## Tooling (shared across backend & frontend)

| Tool          | Role                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `oxlint`      | Linter — `correctness: error`, plus the curated rules in `.oxlintrc.json`. |
| `oxfmt`       | Formatter — 2-space indent, double quotes, semicolons (defaults).          |
| `husky`       | Git hooks — `.husky/pre-commit` runs `lint-staged`.                        |
| `lint-staged` | Runs `oxlint` + `oxfmt --write` on staged files only.                      |

### Commands

```bash
pnpm lint           # oxlint over the repo
pnpm lint:fix       # oxlint --fix (auto-fixable rules)
pnpm format         # oxfmt --write .
pnpm format:check   # oxfmt --check . (CI-safe, no writes)
```

On `git commit`, the pre-commit hook lints and formats staged files. Don't bypass
it with `--no-verify`. Run `pnpm install` once to wire husky (the `prepare` script).

### Rules that apply everywhere

- **`correctness` category is `error`** — correctness violations block the commit.
- **`max-lines` is enforced** (`skipBlankLines` + `skipComments`). Never add a
  `max-lines` disable; split the file or extract focused modules instead. Caps:
  `*.ts` 300, `*.tsx` 400, test files 800, fixture/sample data (`sample-*.ts`,
  `*.fixtures.ts`, `fixtures/**`) 600.
- **Imports:** `consistent-type-imports` (use `import type`), no unused imports.
- **Style:** `curly` (always brace blocks), `prefer-template`, `no-unneeded-ternary`,
  and the `unicorn/*` modernizers (`prefer-at`, `prefer-date-now`, …).
- `typescript/no-explicit-any` is a **warning**, not an error — avoid `any`, but it
  won't block a commit.
- Unused function params must be prefixed with `_` (e.g. `_brand`, `_id`).

## Backend (`apps/backend` + `packages/*`)

NestJS + plain TypeScript. The `react`/`react-hooks` rules simply don't match
non-JSX files, so nothing extra to configure.

- **Line cap: `*.ts` = 300.** Keep controllers/facades/adapters small; the clean
  layered split (`interfaces` / `application` / `domain` / `infrastructure` /
  `internal` / `support`) makes this natural. If a file pushes past 300, extract a
  module rather than disabling the rule.
- **Decorators are fine** — oxlint's `typescript` plugin parses NestJS decorators
  (`@Controller`, `@Get`, `@Injectable`) without extra config.
- **`type` over `interface`** (`consistent-type-definitions`) for shared shapes;
  NestJS DI classes are unaffected.
- Shared types live in `@folio/types` as real `.ts` Zod modules — not `.d.ts`.

## Frontend (`apps/web`)

Next.js 15 + React 19 + TypeScript. The `react`, `react-hooks`, and `react-perf`
plugins are active here.

- **Line cap: `*.tsx` = 400** (components run longer than backend modules), `*.ts`
  = 300 for `lib/` helpers. Sample fixtures in `lib/sample-review.ts` fall under the
  600 fixture cap.
- **React hooks:** `rules-of-hooks` is an **error**; `exhaustive-deps` is a
  **warning** (review it, don't ignore it blindly).
- **JSX hygiene:** `jsx-key`, `jsx-no-target-blank`, `self-closing-comp`,
  `jsx-curly-brace-presence` (no needless `{}` on string props/children),
  `jsx-no-useless-fragment`.
- `.next/` is ignored by oxlint and oxfmt; generated output is never linted.
- Keep using design tokens, not raw colors — see [`design-system.md`](./design-system.md).

## Adding or changing rules

Edit [`.oxlintrc.json`](../.oxlintrc.json). Prefer per-area `overrides` (matched by
glob) over loosening a rule globally. If you need a one-off exception, scope it to
the narrowest glob — never a blanket disable, and never `max-lines`.

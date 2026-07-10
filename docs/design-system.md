# Folio Design System

Folio's UI is **dark-mode only**: warm near-black surfaces, an OKLCH **green**
primary, hairline white-alpha borders, and a dense, chapter-review-focused
layout. This document is the source of truth; the runtime tokens live in
`apps/web/src/app/globals.css`.

## Principles

- **Dark only.** `<html class="dark">`, `color-scheme: dark`. No light theme.
- **Dense, not roomy.** Compact rows (`h-8`/`h-9`), small text (`text-xs`/`text-sm`),
  tight gaps. The UI is information-first and built for repeated PR review.
- **Hairline borders over fills.** Separation comes from `--border`
  (`oklch(1 0 0 / 0.06)`) and subtle surface steps, not heavy shadows.
- **Green is meaning, not decoration.** The primary green signals "good / ready /
  additions". Reserve it; don't paint large areas with it.
- **Reuse tokens and existing components.** Never hardcode hex/oklch in components —
  reference the CSS variables / Tailwind theme colors below.

## Color Tokens

All colors are OKLCH and exposed both as CSS variables (`--name`) and as Tailwind
theme colors (`--color-name`, used via `bg-*`, `text-*`, `border-*`).

### Surfaces & text

| Token                                  | Value                     | Use                            |
| -------------------------------------- | ------------------------- | ------------------------------ |
| `--background`                         | `oklch(0.145 0 0)`        | App background (near-black)    |
| `--foreground`                         | `oklch(0.903 0.014 60.6)` | Default text (warm off-white)  |
| `--card` / `--popover`                 | `oklch(0.192 0.002 17.3)` | Raised panels, cards, popovers |
| `--secondary` / `--muted` / `--accent` | `oklch(0.22 0.002 17.3)`  | Hover fills, muted blocks      |
| `--muted-foreground`                   | `oklch(0.726 0.004 67.8)` | Secondary/label text           |
| `--border`                             | `oklch(1 0 0 / 0.06)`     | Hairline dividers/outlines     |
| `--input`                              | `oklch(0.98 0 0 / 0.15)`  | Input borders                  |

### Brand / semantic

| Token                  | Value                  | Use                                          |
| ---------------------- | ---------------------- | -------------------------------------------- |
| `--primary` / `--ring` | `oklch(0.58 0.13 145)` | Green — primary actions, focus ring, "ready" |
| `--primary-foreground` | `oklch(0.98 0 0)`      | Text on primary                              |
| `--destructive`        | `oklch(0.65 0.2 25)`   | Errors, high risk, deletions                 |

### Sidebar

Dedicated `--sidebar*` tokens (slightly distinct from cards, fainter border
`oklch(1 0 0 / 0.04)`) so the nav rail reads as its own surface.

### Diff & syntax (code panel)

| Token                             | Use                                    |
| --------------------------------- | -------------------------------------- |
| `--diff-add-fg` / `--diff-add-bg` | Added lines (green fg, faint green bg) |
| `--diff-del-fg` / `--diff-del-bg` | Removed lines (red fg, faint red bg)   |
| `--syntax-heading`                | Headings (green)                       |
| `--syntax-link`                   | Links (blue)                           |
| `--syntax-code`                   | Inline code (amber)                    |
| `--syntax-emphasis`               | Emphasis (violet)                      |
| `--gutter-fg`                     | Line-number gutter                     |

## Typography

- **Sans:** Geist (`--font-geist-sans`) — loaded via `next/font` (`geist` pkg) in
  `app/layout.tsx`, never from a CDN.
- **Mono:** Geist Mono (`--font-geist-mono`) — diffs, code, line numbers.
- Scale: the global body is `13px`; UI copy is `text-sm` (13px), while
  metadata/labels/pills use `text-xs` (11px). Headings step up modestly.
  Keep weight at `font-medium`/`font-semibold`; avoid heavy display weights.

## Shape, Spacing, Motion

- **Radius:** `--radius: 0.625rem`. Tailwind exposes `rounded-sm/md/lg/xl` derived
  from it; pills use `rounded-full`.
- **Sidebar width:** `w-64` (256px), hidden below `lg`.
- **Row heights:** controls/nav `h-7`–`h-8`, header bars `h-12`.
- **Borders first, shadows minimal** (`shadow-xs` at most on buttons).
- **Transitions:** color/box-shadow only (`transition-colors`,
  `transition-[color,box-shadow]`); no large motion.
- **Custom scrollbars:** thin (10px), white-alpha thumb — defined in `globals.css`.

## Components

Built on **shadcn / Radix + CVA**, composed with `cn()`
(`clsx` + `tailwind-merge`) from `apps/web/src/lib/utils.ts`.

### Button (`components/ui/button.tsx`)

- Variants: `default` (green), `destructive`, `outline`, `secondary`, `ghost`, `link`.
- Sizes: `xxs` (h-6), `xs` (h-7), `sm` (h-8), `default` (h-9), `lg` (h-10), `icon`.
- `asChild` via Radix `Slot` to render as `Link` etc.

### Status & Risk pills (`components/status-pill.tsx`)

Bordered, tinted-background, `text-xs` rounded-full pills with a lucide icon.
Color encodes state — reuse these rather than inventing new badges:

- **ReviewStatus:** `ready` (green), `processing` (blue/link), `stale` (amber/code),
  `error` (red/destructive).
- **RiskLevel:** `low` (green), `medium` (amber), `high` (red).

### App shell (`components/app-shell.tsx`)

`w-64` sidebar (brand mark, search input, nav links) + content area. Active nav
item uses `bg-accent text-foreground`; idle items are `text-muted-foreground` with
hover `hover:bg-accent`.

### Review surfaces (`components/review/*`)

`top-bar` (breadcrumb), `pr-header` (status/branch/approval), `chapter-panel`
(left: risk + file tree), `diff-viewer` (right: gutter + green/red diff lines +
the small markdown highlighter in `lib/highlight.tsx`).

## Icons

[`lucide-react`](https://lucide.dev). Default `size-4`; inside pills `size-3`.
Icons inherit `currentColor` so they pick up token colors automatically.

## Conventions

- Reference tokens, never raw color values, in components.
- Keep new UI dense, dark, and chapter-review focused.
- Prefer existing primitives (`Button`, pills, app shell) before adding components.
- Sample/mock data lives in `lib/sample-review.ts`; swap for real backend data via
  `lib/api-client.ts` later — keep visual structure identical.

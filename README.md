# Folio

[![Deploy](https://github.com/KMGeon/Folio/actions/workflows/deploy.yml/badge.svg)](https://github.com/KMGeon/Folio/actions/workflows/deploy.yml)
[![Release](https://img.shields.io/badge/release-v0.1.0-0e8a16)](https://github.com/KMGeon/Folio/releases/tag/v0.1.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-App%20Router-000000)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-API-e0234e)](https://nestjs.com/)

Review large pull requests in the order they make sense.

Folio is a GitHub-native review workspace that turns a pull request into ordered,
logical chapters. It gives reviewers the context and review path they need without
asking them to reconstruct a change from a flat list of files.

Production: [folio.ai.kr](https://folio.ai.kr)

## Review the story, not a file list

GitHub's diff is file-first. For a large pull request, reviewers must infer the
change's intent, dependencies, and safest review order themselves. Folio makes that
structure explicit.

| Before Folio | With Folio |
| --- | --- |
| A flat list of changed files | Ordered chapters that group related changes |
| Review order is reconstructed by hand | A guided path through the change |
| Context is scattered across the pull request | Chapter summaries and review focus stay with the relevant diff |
| Progress is hard to see | Chapter and file review progress are visible |

## From pull request to guided review

1. Install the Folio GitHub App for the repositories you want to review.
2. Folio receives pull request updates through the GitHub App webhook.
3. The pull request is organized into ordered review chapters.
4. Open the review in Folio and work through each chapter with focused diffs and progress tracking.

## What Folio gives reviewers

- GitHub App-based pull request ingestion.
- Chapter generation that groups related files into a logical review sequence.
- A chapter-first review UI with pull request context, summaries, and focused diffs.
- Chapter and file viewed-state tracking to make review progress clear.
- GitHub-linked pull request context and inline review comment support.
- Markdown tables and prologue context where they help explain a change.

## Built around GitHub

Folio uses GitHub for repository access and pull request data. The GitHub App is
the integration point for receiving pull request events; Folio then provides a
separate, chapter-first workspace for understanding and reviewing the change.

The product is a pnpm + TypeScript monorepo with a Next.js App Router web app and
a NestJS API/webhook server. Shared packages cover database access, GitHub
integration, diff parsing, chapter decomposition, and API types.

## Run Folio locally

Use Node.js 20 or newer and pnpm 10.32.1. Copy the environment template, then add
the Supabase database and GitHub App values for your development environment.

```bash
cp .env.example .env
pnpm install
pnpm dev:backend
pnpm dev:web
```

The backend runs at `http://localhost:8080`; the web app runs at
`http://localhost:5173`.

Use explicit profiles in `.env`:

- Backend: `APP_PROFILE=dev` or `APP_PROFILE=prd`
- Web: `NEXT_PUBLIC_APP_PROFILE=dev` or `NEXT_PUBLIC_APP_PROFILE=prd`

Before a production change, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Project layout

```txt
apps/
  backend/     NestJS API and GitHub App webhook server
  web/         Next.js App Router review UI
packages/      Database, diff, GitHub, decomposition, and type modules
docs/          Product, design-system, and engineering documentation
```

## Release

Current production release: [v0.1.0](https://github.com/KMGeon/Folio/releases/tag/v0.1.0).

## Support

For support or policy questions, contact [support.foliodev@gmail.com](mailto:support.foliodev@gmail.com).

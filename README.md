# Folio

[![Deploy](https://github.com/KMGeon/Folio/actions/workflows/deploy.yml/badge.svg)](https://github.com/KMGeon/Folio/actions/workflows/deploy.yml)
[![Release](https://img.shields.io/badge/release-v0.1.0-0e8a16)](https://github.com/KMGeon/Folio/releases/tag/v0.1.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-App%20Router-000000)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-API-e0234e)](https://nestjs.com/)

Folio is a GitHub-native pull request review tool that turns a large PR into
ordered review chapters.

Instead of asking reviewers to read one long diff from top to bottom, Folio groups
related files, commits, and comments into a sequence that matches how the change
should be understood.

Production: [https://folio.ai.kr](https://folio.ai.kr)

## Why Folio

Large pull requests are hard to review because the GitHub diff is file-first.
Reviewers have to reconstruct the intent, dependencies, and review order by hand.

Folio makes the review flow chapter-first:

- Start with the context for the pull request.
- Review related changes together.
- Move through the PR in a logical order.
- Keep comments and changed code close to the chapter they belong to.
- Use GitHub as the source of truth for identity, repository access, and PR data.

## Core Features

- GitHub App based PR ingestion.
- Chapter generation for large pull requests.
- GitHub OAuth login and repository access checks.
- Chapter-focused review UI.
- PR comments, prologue context, markdown tables, and inline diff comment support.
- Production deployment for the Folio web app and API.

## How It Works

1. A GitHub pull request is opened or updated.
2. Folio receives the PR data through the GitHub App.
3. The PR is decomposed into ordered review chapters.
4. A reviewer logs in with GitHub.
5. Folio shows only reviews the user can access on GitHub.
6. The reviewer reads the PR chapter by chapter.

## Technology

Folio is a pnpm + TypeScript monorepo.

- Next.js App Router for the web UI.
- NestJS for the API and GitHub webhook server.
- PostgreSQL and Drizzle for persistence.
- Shared packages for GitHub integration, diff parsing, chapter decomposition, and
  API types.

## Release

Current production release: [v0.1.0](https://github.com/KMGeon/Folio/releases/tag/v0.1.0)

### v0.1.0 Highlights

| Author | Change                                                                         |
| ------ | ------------------------------------------------------------------------------ |
| KMGeon | Added production deployment for `folio.ai.kr`.                                 |
| KMGeon | Added the GitHub App based review flow.                                        |
| KMGeon | Added chapter-first PR review screens.                                         |
| KMGeon | Added PR comment, markdown table, prologue, and inline diff comment rendering. |
| KMGeon | Simplified the dashboard for the current review workflow.                      |

## Support

For support or policy questions, contact `support.foliodev@gmail.com`.

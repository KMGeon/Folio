# @folio/github

Folio's single typed gateway to GitHub. Every module that touches GitHub —
webhook ingestion (I1), the decomposition worker (I2), the bot comment (I3), the
Check Run (I4), two-way sync (I5/I6), and the backend API (B2) — imports from
here so authentication, the App-only Check Run capability, and rate-limit safety
are centralized and tested once.

It depends only on `@folio/types` (shared shapes such as `ReviewState`). It does
**not** depend on `@folio/db` or any backend.

## Why a GitHub App (not an OAuth app or a PAT) — hard requirement

A custom Check Run **`details_url`** (the clickable "Open in Folio" link, I4) can
**only** be set by a GitHub App. A Personal Access Token or the default
`GITHUB_TOKEN` cannot set it. Building Folio as a GitHub App also gives:

- **Fine-grained, per-installation permissions** scoped to exactly what we need.
- **5,000 requests/hour per installation** (not shared across all users).
- A first-class bot identity (`folio[bot]`) for comments and reviews.

## Auth chain

```
App private key (PEM)
  └─ RS256 JWT  (iss = appId, iat backdated 60s, exp ≤ 10 min)   ← createAppJwt
       └─ installation access token  (TTL 1 hr, scoped to install) ← getInstallationToken (cached, refreshed ≥60s early)
            └─ Octokit REST calls                                  ← createInstallationOctokit
```

App-level endpoints (`GET /app`, listing installations) use the JWT directly via
`createAppOctokit()`.

Webhooks are verified with **HMAC-SHA256** over the _raw_ request body using the
webhook secret (`verifyWebhookSignature`, constant-time, never throws).

## Required fine-grained permissions

| Permission        | Access           | Why                                                                                       |
| ----------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| **Pull requests** | **Read & write** | Read PR metadata/diff/files/reviews; create & edit bot comments (I3).                     |
| **Contents**      | **Read**         | Read file/blob content for decomposition (I2).                                            |
| **Checks**        | **Read & write** | Create/update the Folio Check Run with a custom `details_url` and requested actions (I4). |
| **Metadata**      | **Read**         | Mandatory baseline for any App (repo identity).                                           |
| Commit statuses   | Write (optional) | Optional legacy status surface alongside the Check Run.                                   |

## Subscribed webhook events

`pull_request`, `pull_request_review`, `pull_request_review_comment`,
`issue_comment`, `check_run`, `check_suite`, `installation`,
`installation_repositories`.

`parseWebhookEvent(headers, rawBody)` narrows these into a typed discriminated
union and returns `null` for anything else (or an unparseable body). The HTTP
endpoint and enqueue logic live in I1; this package only verifies + parses.

## Environment variables

Loaded/validated by `loadGitHubConfig(env)` (a Zod schema, re-exported for F2):

- `GITHUB_APP_ID` — numeric App ID.
- `GITHUB_APP_PRIVATE_KEY` — PEM. Accepts raw PEM, `\n`-escaped PEM, or base64.
- `GITHUB_APP_WEBHOOK_SECRET` — webhook HMAC secret.
- `GITHUB_APP_SLUG` — used to build the install URL.
- `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` — for the W2 OAuth sign-in flow.

## Rate limiting

`withRateLimitRetry(fn)` wraps an Octokit call. On `403`/`429` it honors, in
precedence order, `Retry-After` (seconds) then `x-ratelimit-reset` (epoch
seconds), falling back to bounded exponential backoff. After `maxAttempts` it
throws `RateLimitError` (carrying `resetAt`).

## Read-vs-write error philosophy

Reads tolerate failure (return `[]`/`null` so PR context never breaks the UI)
while writes surface errors with a clean message because the caller explicitly
asked to mutate the PR.

# GitHub OAuth (User Login + Private-Repo Access Control) — Design

Date: 2026-06-20
Status: Approved for planning

## Problem

Folio's main job is showing a PR as ordered review chapters. PR data is fetched
with the GitHub **App installation token**, which means the app itself can read
private repos. If that data is served by URL alone, anyone — unauthenticated or
an unrelated user — could open `/{org}/{repo}/pull/{n}` and read a private PR.

We need to ensure a viewer can only see a PR if they actually have access to that
repo on GitHub.

## Key Insight

App (installation) auth proves **the app** can read the repo — not that **the
viewer** is allowed to. Enforcing per-viewer access therefore requires:

1. **Identity** — verify who the viewer is (GitHub OAuth login). A
   client-supplied identity cannot be trusted.
2. **Authorization** — check that identified user's permission on the repo.

The authorization *check* itself can be done with the **installation token**
(Model B) rather than a stored per-user token (Model A). Model B is chosen: no
sensitive user access tokens are persisted.

## Chosen Model (Model B)

- **OAuth = login/identity only.** The user-to-server token from the OAuth code
  exchange is used **once** to call `GET /user`, then discarded. No user access
  or refresh tokens are stored.
- **Authorization = installation token, live, per request.** For a PR-scoped
  request, resolve the repo's installation and call
  `GET /repos/{owner}/{repo}/collaborators/{login}/permission`. `admin/write/read`
  → allow; `none`/404 → 403. Short TTL cache to avoid hammering GitHub.

### Open implementation check
The collaborator-permission endpoint must be callable with the current App
permissions (Metadata: read). Verify during implementation. If it requires a
broader permission than we want to grant, fall back to a per-user-token check
for that single call path (Model A) without changing the rest of the design.

## Scope

- App-wide protection: **every** web page and real-data API requires a valid
  session. Only `/login` and the OAuth callback are public. Unauthenticated
  requests redirect to `/login` (web) or return 401 (API).
- Private-repo PR access enforced live on every PR-scoped request.

Out of scope: storing user GitHub tokens, refresh-token rotation, multi-provider
auth, org/team management UI, role-based feature gating.

## Authentication Flow

1. Web login button → `GET /api/v1/auth/github/login?redirect=<path>`.
2. Backend generates a random `state`, stores it in a short-lived httpOnly
   `folio_oauth_state` cookie (also encodes the post-login `redirect`), and 302s
   to the GitHub authorize URL (`client_id`, `state`, `redirect_uri` = backend
   callback).
3. User authorizes → `GET /api/v1/auth/github/callback?code&state`.
4. Backend validates `state` against the cookie, exchanges `code` for a
   user-to-server token, calls `GET /user`, and **discards the token**.
5. Upsert into `users` (`githubUserId`, `login`, `avatarUrl`, `email`).
6. Create a session row; set httpOnly `folio_session` cookie; 302 to
   `WEB_ORIGIN` + validated redirect path.
7. `GET /api/v1/auth/me` returns the current user; `POST /api/v1/auth/logout`
   deletes the session row and clears the cookie.

## Session

- Cookie `folio_session` carries a random 32-byte (base64url) token; the DB
  stores only `sha256(token)`.
- `sessions` table (already exists) gains a `token_hash` unique column. Lookup by
  hash. Fixed 30-day expiry (`expiresAt` already exists).
- `SessionAuthGuard` reads the cookie, loads the session + user, attaches
  `req.user`/`req.userId`. Missing/expired → 401 and clear the cookie.
- Cookie attributes: `httpOnly`, `sameSite=lax`, `secure` in prd (`secure=false`
  in dev). Web (`5173`) and API (`8080`) are same-site (`localhost`) in dev, so
  Lax cookies are sent on credentialed cross-origin fetches.

## Authorization (Private-Repo Gate)

- `RepoAccessGuard` runs after `SessionAuthGuard` on PR-scoped routes.
- Resolve `owner/repo` from the route → find the `repositories` →
  `installations` row → mint an installation token (existing
  `@folio/github` installation-token helpers).
- Call `GET /repos/{owner}/{repo}/collaborators/{login}/permission`. Map
  `none`/404 → 403; otherwise allow.
- In-memory cache keyed `(userId, owner/repo)` with ~60s TTL to bound GitHub
  calls. (Errs toward fresh: short TTL means revoked access reflects within ~1m.)
- A guessed URL to a private repo the user cannot access returns 403 from the
  API; the web page renders an access-denied state.

## Components

### `packages/github`
- `auth/user-oauth.ts` — `buildAuthorizeUrl({ state, redirectUri })`,
  `exchangeOAuthCode(code)` → `{ accessToken }`, `getAuthenticatedUser(token)`
  → `{ id, login, avatarUrl, email }`. Uses GitHub OAuth web endpoints +
  `https://api.github.com/user`.
- `checkUserRepoPermission(installationToken, owner, repo, login)` → boolean.
  Lives alongside existing pull-request/check-run helpers.
- Exports added to `packages/github/src/index.ts`.

### `packages/db`
- `sessions.token_hash` column (unique) added to the existing schema.
- `sessionsRepo` (new): `create`, `getByTokenHash`, `delete`, `deleteExpired`.
- Drizzle migration `0001_*` for the new column.
- No new token table (Model B).

### `apps/backend` (clean layers)
- `interfaces/api/auth/auth.controller.ts` — `login`, `callback`, `me`, `logout`.
- `application/auth/auth.facade.ts` — orchestrates callback → user upsert →
  session create.
- `domain/auth/session.service.ts` — create/validate/expire sessions, token
  hashing.
- `domain/auth/repo-access.service.ts` — permission check + TTL cache.
- `infrastructure/github/github-oauth.adapter.ts` — wraps `@folio/github`
  user-oauth + installation token.
- `interfaces/api/common/session-auth.guard.ts` and `repo-access.guard.ts`.
- `config.ts` — parse `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`,
  `GITHUB_APP_SLUG`; add `PUBLIC_API_BASE_URL` (callback base) and cookie
  options; mark client id/secret + private key required in prd.

### `apps/web`
- `lib/api-client.ts` — add `credentials: "include"` to all requests; on 401,
  redirect to `/login`.
- `lib/auth.ts` — `getMe()`, `loginUrl(redirect)`, `logout()`.
- Login page button → backend login URL with current path as `redirect`.
- App-wide guard: unauthenticated users are redirected to `/login`
  (server-side check in the protected layout / middleware).
- 403 access-denied UI for PR pages the user can't access.
- `top-bar`/`app-shell` — show user avatar + logout.

## Error Handling

All via the common response envelope + `CoreExceptionFilter`:
- OAuth `state` mismatch → 400, redirect to `/login?error=oauth_state`.
- Code exchange / `GET /user` failure → 400.
- Missing/expired session → 401, clear cookie (web redirects to `/login`).
- Repo access denied → 403 (web shows access-denied).
- GitHub API/transport errors → mapped through existing error types.

## Testing (vitest, following existing patterns)

- `packages/github`: authorize-URL builder, code exchange (fetch mock),
  `getAuthenticatedUser` (mock), `checkUserRepoPermission` (200 read / 404 / none).
- `packages/db`: `sessionsRepo` create/lookup-by-hash/delete/expire.
- backend domain: `session.service` create/validate/expire + hashing;
  `repo-access.service` allow/deny + cache TTL.
- backend controller: callback happy path + `state` mismatch (supertest-style);
  `SessionAuthGuard` 401; `RepoAccessGuard` 403.

## Prerequisites (manual, GitHub App settings)

- Register the OAuth **Callback URL**:
  `http://localhost:8080/api/v1/auth/github/callback` (dev) and the prd
  equivalent.
- Populate `GITHUB_APP_PRIVATE_KEY` in `.env` — required for installation tokens
  used by the authorization check (currently empty).
- `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` are already present.

## Data Model Delta

```
sessions
  + token_hash  text  unique   -- sha256 of the cookie token
(users, file_review_state, chapter_review_state already exist — unchanged)
```

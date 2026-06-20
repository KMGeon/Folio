# GitHub OAuth (Login + Private-Repo Access Control) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub App user-to-server OAuth login plus live per-viewer authorization so a user can only open a PR review if they actually have access to that repo on GitHub.

**Architecture:** OAuth is used for **identity only** (the user token is used once to fetch `/user`, then discarded — Model B). A DB-backed httpOnly cookie session tracks the logged-in user. On every PR-scoped request, a guard resolves the repo's installation and asks GitHub — using the **installation token** — whether the logged-in user has read permission on that repo (`GET /repos/{owner}/{repo}/collaborators/{username}/permission`), with a short TTL cache. The whole app requires a session; only `/login` and the OAuth callback are public.

**Tech Stack:** TypeScript ESM monorepo (pnpm), NestJS 11 (Express), Drizzle ORM + Postgres, Octokit, Next.js 15 (App Router), Vitest + supertest. Design doc: `docs/specs/2026-06-20-github-oauth-design.md`.

## Global Constraints

- Node `>=20`; ESM only — all relative imports end in `.js`.
- All API responses use the common envelope (`successResponse` / `CoreExceptionFilter`); errors are thrown as `CoreException(ErrorType.X)`.
- Never add a `max-lines` lint disable — split files instead. Never bypass the pre-commit hook (`--no-verify`).
- No vague filenames (`utils`/`helpers`/`common`) — name files after the concrete concept.
- Backend follows clean layers: `interfaces` / `application` / `domain` / `infrastructure` / `internal` / `support`.
- Dark-mode only UI; reuse tokens in `apps/web/src/app/globals.css` and primitives in `apps/web/src/components/ui/`.
- Profiles: `APP_PROFILE=dev|prd`; dev keeps the server bootable with empty secrets, prd requires them.
- Comments explain the non-obvious **why**, one or two lines.
- Verify before claiming done: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- DB e2e tests self-skip when `DATABASE_URL` is unset (`HAS_DB`); dev Postgres runs on port 5433. github/backend unit tests must not require a live DB or network — inject fakes.

---

## File Structure

**`packages/db`**
- Modify `src/schema/sessions.ts` — add `token_hash` unique column.
- Create `src/repos/sessions.ts` — `sessionsRepo`.
- Modify `src/repos/index.ts` — export `sessionsRepo`.
- Generate `drizzle/0001_*.sql` (+ meta) via drizzle-kit.
- Create `test/sessions.e2e.test.ts`.

**`packages/github`**
- Create `src/auth/user-oauth.ts` — authorize URL + code exchange + authenticated user.
- Create `src/repo-permission.ts` — `checkUserRepoPermission`.
- Modify `src/index.ts` — export the above.
- Create `src/__tests__/user-oauth.test.ts`, `src/__tests__/repo-permission.test.ts`.

**`apps/backend`**
- Modify `src/config.ts` — OAuth/cookie/public-base config.
- Create `src/internal/github/github-bootstrap.ts` — configure installation auth + clients once at startup.
- Create `src/domain/auth/session.service.ts` — token gen/hash, create/validate/expire.
- Create `src/domain/auth/repo-access.service.ts` — permission check + TTL cache.
- Create `src/infrastructure/github/github-oauth.adapter.ts` — wraps `@folio/github` oauth + installation permission check.
- Create `src/application/auth/auth.facade.ts` — callback orchestration.
- Create `src/interfaces/api/auth/auth.controller.ts` — `login`/`callback`/`me`/`logout`.
- Create `src/interfaces/api/common/session-auth.guard.ts` and `src/interfaces/api/common/repo-access.guard.ts`.
- Create `src/interfaces/api/common/current-user.decorator.ts` — `@CurrentUser()` param.
- Modify `src/support/error/error-type.ts` — add auth error types.
- Modify `src/app.module.ts` — register auth providers/controller.
- Modify `src/index.ts` — call `cookieParser()` and `bootstrapGitHub()`.
- Modify `apps/backend/package.json` — add `@folio/db`, `cookie-parser` deps.
- Tests: `src/domain/auth/*.test.ts`, `src/interfaces/api/auth/auth.controller.test.ts`.

**`apps/web`**
- Modify `src/lib/api-client.ts` — `credentials: "include"`, redirect to `/login` on 401.
- Create `src/lib/auth.ts` — `getMe()`, `loginUrl()`, `logoutUrl()`.
- Modify `src/app/login/page.tsx` — real login link.
- Create `src/middleware.ts` — app-wide session gate.
- Modify `src/components/review/top-bar.tsx` — user avatar + logout.

---

## Task 1: DB — `sessions.token_hash` column + `sessionsRepo` + migration

**Files:**
- Modify: `packages/db/src/schema/sessions.ts`
- Create: `packages/db/src/repos/sessions.ts`
- Modify: `packages/db/src/repos/index.ts`
- Generate: `packages/db/drizzle/0001_*.sql` (+ `meta`)
- Test: `packages/db/test/sessions.e2e.test.ts`

**Interfaces:**
- Consumes: existing `usersRepo`, `getDb`, `baseColumns`, test helpers `getTestDb`/`resetDb`/`seedBase`/`HAS_DB`.
- Produces:
  - `sessions.tokenHash` column (text, unique, not null).
  - `sessionsRepo.create(input: SessionInsert, db?) => Promise<SessionRow>`
  - `sessionsRepo.getByTokenHash(tokenHash: string, db?) => Promise<SessionRow | null>`
  - `sessionsRepo.deleteByTokenHash(tokenHash: string, db?) => Promise<void>`
  - `sessionsRepo.deleteExpired(now: Date, db?) => Promise<void>`
  - `SessionRow` now includes `tokenHash: string`.

- [ ] **Step 1: Add the column to the schema**

In `packages/db/src/schema/sessions.ts`, add `text` to the import and a `tokenHash` column:

```typescript
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { users } from "./users.js";

export const sessions = pgTable("sessions", {
  ...baseColumns(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // sha256 hex of the opaque cookie token; the raw token never touches the DB.
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
});

export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @folio/db db:generate`
Expected: creates `packages/db/drizzle/0001_*.sql` adding `token_hash` with a unique constraint, and updates `drizzle/meta`. Open the generated `.sql` and confirm it contains `ALTER TABLE "sessions" ADD COLUMN "token_hash" text NOT NULL` and a unique constraint. (The `sessions` table is empty in every environment, so a NOT NULL add is safe.)

- [ ] **Step 3: Write the `sessionsRepo`**

Create `packages/db/src/repos/sessions.ts`:

```typescript
import { and, eq, lt } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type SessionInsert, type SessionRow, sessions } from "../schema/sessions.js";

export const sessionsRepo = {
  async create(input: SessionInsert, db: Db = getDb()): Promise<SessionRow> {
    const [row] = await db.insert(sessions).values(input).returning();
    if (!row) {
      throw new Error("sessionsRepo.create: insert returned no row");
    }
    return row;
  },

  async getByTokenHash(tokenHash: string, db: Db = getDb()): Promise<SessionRow | null> {
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  },

  async deleteByTokenHash(tokenHash: string, db: Db = getDb()): Promise<void> {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  },

  async deleteExpired(now: Date, db: Db = getDb()): Promise<void> {
    await db.delete(sessions).where(and(lt(sessions.expiresAt, now)));
  },
};
```

- [ ] **Step 4: Export the repo**

In `packages/db/src/repos/index.ts`, add after the `usersRepo` export line:

```typescript
export { sessionsRepo } from "./sessions.js";
```

- [ ] **Step 5: Write the e2e test**

Create `packages/db/test/sessions.e2e.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { sessionsRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";
import { type BaseFixture, seedBase } from "./helpers/fixtures.js";

const d = HAS_DB ? describe : describe.skip;

d("sessionsRepo (e2e)", () => {
  let db: Db;
  let base: BaseFixture;

  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
    base = await seedBase(db);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("creates and looks up a session by token hash", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const created = await sessionsRepo.create(
      { userId: base.userId, tokenHash: "hash-1", expiresAt },
      db,
    );
    expect(created.tokenHash).toBe("hash-1");

    const found = await sessionsRepo.getByTokenHash("hash-1", db);
    expect(found?.id).toBe(created.id);
    expect(found?.userId).toBe(base.userId);

    expect(await sessionsRepo.getByTokenHash("missing", db)).toBeNull();
  });

  it("deletes a session by token hash", async () => {
    await sessionsRepo.create(
      { userId: base.userId, tokenHash: "hash-2", expiresAt: new Date(Date.now() + 60_000) },
      db,
    );
    await sessionsRepo.deleteByTokenHash("hash-2", db);
    expect(await sessionsRepo.getByTokenHash("hash-2", db)).toBeNull();
  });

  it("deleteExpired removes only past-due sessions", async () => {
    await sessionsRepo.create(
      { userId: base.userId, tokenHash: "old", expiresAt: new Date(Date.now() - 1_000) },
      db,
    );
    await sessionsRepo.create(
      { userId: base.userId, tokenHash: "fresh", expiresAt: new Date(Date.now() + 60_000) },
      db,
    );
    await sessionsRepo.deleteExpired(new Date(), db);
    expect(await sessionsRepo.getByTokenHash("old", db)).toBeNull();
    expect(await sessionsRepo.getByTokenHash("fresh", db)).not.toBeNull();
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `DATABASE_URL=postgres://folio:folio@localhost:5433/folio pnpm --filter @folio/db test`
Expected: PASS (sessions e2e + existing e2e). If Postgres isn't running, start it with `pnpm db:up` first.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/sessions.ts packages/db/src/repos/sessions.ts packages/db/src/repos/index.ts packages/db/drizzle packages/db/test/sessions.e2e.test.ts
git commit -m "feat(db): add sessions.token_hash column and sessionsRepo"
```

---

## Task 2: github — user-oauth module (authorize URL, code exchange, authenticated user)

**Files:**
- Create: `packages/github/src/auth/user-oauth.ts`
- Modify: `packages/github/src/index.ts`
- Test: `packages/github/src/__tests__/user-oauth.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks; uses global `fetch` (injectable for tests).
- Produces:
  - `buildAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }): string`
  - `exchangeOAuthCode(input: { clientId: string; clientSecret: string; code: string; fetchImpl?: typeof fetch }): Promise<{ accessToken: string }>`
  - `getAuthenticatedUser(input: { accessToken: string; fetchImpl?: typeof fetch }): Promise<OAuthUser>`
  - `interface OAuthUser { id: number; login: string; avatarUrl: string; email: string | null }`

- [ ] **Step 1: Write the failing tests**

Create `packages/github/src/__tests__/user-oauth.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  exchangeOAuthCode,
  getAuthenticatedUser,
} from "../auth/user-oauth.js";

describe("buildAuthorizeUrl", () => {
  it("builds the GitHub authorize URL with encoded params", () => {
    const url = buildAuthorizeUrl({
      clientId: "Iv1.abc",
      redirectUri: "http://localhost:8080/api/v1/auth/github/callback",
      state: "xyz",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("Iv1.abc");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:8080/api/v1/auth/github/callback",
    );
    expect(parsed.searchParams.get("state")).toBe("xyz");
  });
});

describe("exchangeOAuthCode", () => {
  it("posts the code and returns the access token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "gho_token", token_type: "bearer" }),
    });
    const result = await exchangeOAuthCode({
      clientId: "id",
      clientSecret: "secret",
      code: "the-code",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.accessToken).toBe("gho_token");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://github.com/login/oauth/access_token");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("throws when GitHub returns an error payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: "bad_verification_code" }),
    });
    await expect(
      exchangeOAuthCode({
        clientId: "id",
        clientSecret: "secret",
        code: "bad",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/bad_verification_code/);
  });
});

describe("getAuthenticatedUser", () => {
  it("maps the GitHub user payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 42,
        login: "octocat",
        avatar_url: "https://avatars/octocat",
        email: "octo@github.com",
      }),
    });
    const user = await getAuthenticatedUser({
      accessToken: "gho_token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(user).toEqual({
      id: 42,
      login: "octocat",
      avatarUrl: "https://avatars/octocat",
      email: "octo@github.com",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @folio/github test -- user-oauth`
Expected: FAIL — cannot find module `../auth/user-oauth.js`.

- [ ] **Step 3: Implement the module**

Create `packages/github/src/auth/user-oauth.ts`:

```typescript
/**
 * GitHub App user-to-server OAuth. Folio uses this only to *identify* the
 * logged-in user (see design Model B) — the access token is used once to read
 * `/user` and then discarded, never persisted.
 */
export interface OAuthUser {
  id: number;
  login: string;
  avatarUrl: string;
  email: string | null;
}

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";

export function buildAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeOAuthCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string }> {
  const doFetch = input.fetchImpl ?? fetch;
  const res = await doFetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (data.error || !data.access_token) {
    throw new Error(`GitHub token exchange failed: ${data.error ?? "no access_token"}`);
  }
  return { accessToken: data.access_token };
}

export async function getAuthenticatedUser(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<OAuthUser> {
  const doFetch = input.fetchImpl ?? fetch;
  const res = await doFetch(USER_URL, {
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      accept: "application/vnd.github+json",
      "user-agent": "folio",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub /user failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    id: number;
    login: string;
    avatar_url: string;
    email: string | null;
  };
  return {
    id: data.id,
    login: data.login,
    avatarUrl: data.avatar_url,
    email: data.email ?? null,
  };
}
```

- [ ] **Step 4: Export from the package index**

In `packages/github/src/index.ts`, inside the `// ─── Auth ───` block, add:

```typescript
export {
  buildAuthorizeUrl,
  exchangeOAuthCode,
  getAuthenticatedUser,
  type OAuthUser,
} from "./auth/user-oauth.js";
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @folio/github test -- user-oauth`
Expected: PASS (all three describe blocks).

- [ ] **Step 6: Commit**

```bash
git add packages/github/src/auth/user-oauth.ts packages/github/src/index.ts packages/github/src/__tests__/user-oauth.test.ts
git commit -m "feat(github): add user-to-server OAuth identity helpers"
```

---

## Task 3: github — `checkUserRepoPermission` (installation-token authorization)

**Files:**
- Create: `packages/github/src/repo-permission.ts`
- Modify: `packages/github/src/index.ts`
- Test: `packages/github/src/__tests__/repo-permission.test.ts`

**Interfaces:**
- Consumes: `Octokit` type from `octokit` (a client the caller already minted via `createInstallationOctokit`).
- Produces:
  - `checkUserRepoPermission(client: Octokit, input: { owner: string; repo: string; username: string }): Promise<boolean>` — `true` for `admin`/`write`/`read`, `false` for `none` or 404.

- [ ] **Step 1: Write the failing tests**

Create `packages/github/src/__tests__/repo-permission.test.ts`:

```typescript
import type { Octokit } from "octokit";
import { describe, expect, it, vi } from "vitest";
import { checkUserRepoPermission } from "../repo-permission.js";

function fakeOctokit(getCollaboratorPermissionLevel: ReturnType<typeof vi.fn>): Octokit {
  return {
    rest: { repos: { getCollaboratorPermissionLevel } },
  } as unknown as Octokit;
}

const REF = { owner: "acme", repo: "widget", username: "octocat" };

describe("checkUserRepoPermission", () => {
  it("returns true for read/write/admin", async () => {
    for (const permission of ["read", "write", "admin"]) {
      const fn = vi.fn().mockResolvedValue({ data: { permission } });
      expect(await checkUserRepoPermission(fakeOctokit(fn), REF)).toBe(true);
    }
  });

  it("returns false for none", async () => {
    const fn = vi.fn().mockResolvedValue({ data: { permission: "none" } });
    expect(await checkUserRepoPermission(fakeOctokit(fn), REF)).toBe(false);
  });

  it("returns false when GitHub responds 404", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 404 });
    expect(await checkUserRepoPermission(fakeOctokit(fn), REF)).toBe(false);
  });

  it("rethrows non-404 errors", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 500 });
    await expect(checkUserRepoPermission(fakeOctokit(fn), REF)).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @folio/github test -- repo-permission`
Expected: FAIL — cannot find module `../repo-permission.js`.

- [ ] **Step 3: Implement the module**

Create `packages/github/src/repo-permission.ts`:

```typescript
import type { Octokit } from "octokit";

/**
 * Whether `username` can read `owner/repo`, checked with an *installation*
 * token (design Model B). GitHub returns the effective permission level
 * (admin/write/read/none) accounting for org/team access; 404 means the user
 * is not a collaborator → no access.
 */
export async function checkUserRepoPermission(
  client: Octokit,
  input: { owner: string; repo: string; username: string },
): Promise<boolean> {
  try {
    const res = await client.rest.repos.getCollaboratorPermissionLevel({
      owner: input.owner,
      repo: input.repo,
      username: input.username,
    });
    return res.data.permission !== "none";
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { status?: number }).status === 404) {
      return false;
    }
    throw error;
  }
}
```

- [ ] **Step 4: Export from the package index**

In `packages/github/src/index.ts`, after the `// ─── Pull request ───` block add a new block:

```typescript
// ─── Repo permission ─────────────────────────────────────────────────────────
export { checkUserRepoPermission } from "./repo-permission.js";
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @folio/github test -- repo-permission`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/github/src/repo-permission.ts packages/github/src/index.ts packages/github/src/__tests__/repo-permission.test.ts
git commit -m "feat(github): add installation-token repo permission check"
```

---

## Task 4: backend — config, deps, and GitHub bootstrap wiring

**Files:**
- Modify: `apps/backend/package.json`
- Modify: `apps/backend/src/config.ts`
- Modify: `apps/backend/src/config.test.ts`
- Create: `apps/backend/src/internal/github/github-bootstrap.ts`
- Modify: `apps/backend/src/index.ts`

**Interfaces:**
- Consumes: `@folio/github` (`loadGitHubConfig`, `configureInstallationAuth`, `configureClients`), `@folio/db`.
- Produces:
  - `config` gains: `GITHUB_APP_CLIENT_ID?`, `GITHUB_APP_CLIENT_SECRET?`, `GITHUB_APP_SLUG?`, `PUBLIC_API_BASE_URL` (default `http://localhost:8080`).
  - `cookieIsSecure(): boolean` helper exported from `config.ts` (`true` when `APP_PROFILE === "prd"`).
  - `bootstrapGitHub(): void` — idempotent; configures installation auth + clients from env. No-op (logs a warning) if App credentials are absent (dev with empty key).

- [ ] **Step 1: Add backend dependencies**

In `apps/backend/package.json`, add to `dependencies` (keep alphabetical-ish with the existing entries):

```json
"@folio/db": "workspace:*",
"cookie-parser": "^1.4.7",
```

and to `devDependencies`:

```json
"@types/cookie-parser": "^1.4.8",
```

Run: `pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 2: Extend the config schema**

In `apps/backend/src/config.ts`, add these fields to `baseSchema` (after `GITHUB_APP_WEBHOOK_SECRET`):

```typescript
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_APP_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),
  // Public base URL of this backend; used to build the OAuth callback redirect.
  PUBLIC_API_BASE_URL: z.string().default("http://localhost:8080"),
```

Add the client id/secret to `REQUIRED_IN_PRD`:

```typescript
const REQUIRED_IN_PRD = [
  "DATABASE_URL",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_WEBHOOK_SECRET",
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_CLIENT_SECRET",
  "ANTHROPIC_API_KEY",
] as const satisfies readonly (keyof Config)[];
```

At the end of the file, export the cookie-secure helper:

```typescript
/** Session/state cookies are Secure only in prd (dev runs plain http). */
export function cookieIsSecure(): boolean {
  return config.APP_PROFILE === "prd";
}
```

- [ ] **Step 3: Add a prd-required config test**

In `apps/backend/src/config.test.ts`, find the existing prd "missing required" test and add `GITHUB_APP_CLIENT_ID`/`GITHUB_APP_CLIENT_SECRET` to whatever env it sets so the test still constructs a valid prd config (mirror the existing keys it sets, adding the two new ones). If the test asserts the *missing* list, add the two new keys to the expected-missing assertion. Keep the test green either way.

- [ ] **Step 4: Write the bootstrap module**

Create `apps/backend/src/internal/github/github-bootstrap.ts`:

```typescript
import { configureClients, configureInstallationAuth, loadGitHubConfig } from "@folio/github";

let bootstrapped = false;

/**
 * Configure the @folio/github installation-token + client singletons once at
 * startup. Required by the repo-access guard (Model B authorizes via the
 * installation token). No-op in dev when App credentials are absent so the
 * server still boots; the guard surfaces a clear error if it's actually used.
 */
export function bootstrapGitHub(): void {
  if (bootstrapped) {
    return;
  }
  if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_APP_PRIVATE_KEY) {
    console.warn("[folio] GitHub App credentials absent — installation auth not configured");
    return;
  }
  const cfg = loadGitHubConfig(process.env);
  configureInstallationAuth(cfg);
  configureClients(cfg);
  bootstrapped = true;
}
```

- [ ] **Step 5: Call bootstrap + cookie parser at startup**

In `apps/backend/src/index.ts`, import and wire them:

```typescript
import "reflect-metadata";
import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { config } from "./config.js";
import { bootstrapGitHub } from "./internal/github/github-bootstrap.js";

async function bootstrap() {
  bootstrapGitHub();
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(cookieParser());
  app.enableCors({
    origin: config.WEB_ORIGIN,
    credentials: true,
  });

  await app.listen(config.PORT);
  console.log(`[folio] backend listening on http://localhost:${config.PORT}`);
}

await bootstrap();
```

- [ ] **Step 6: Verify typecheck + existing tests still pass**

Run: `pnpm --filter @folio/backend typecheck && pnpm --filter @folio/backend test`
Expected: PASS (health + webhook + config tests).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/package.json apps/backend/src/config.ts apps/backend/src/config.test.ts apps/backend/src/internal/github/github-bootstrap.ts apps/backend/src/index.ts pnpm-lock.yaml
git commit -m "feat(backend): OAuth/cookie config and GitHub installation bootstrap"
```

---

## Task 5: backend — session domain service

**Files:**
- Create: `apps/backend/src/domain/auth/session.service.ts`
- Test: `apps/backend/src/domain/auth/session.service.test.ts`

**Interfaces:**
- Consumes: `sessionsRepo`, `usersRepo` from `@folio/db`; node `crypto`.
- Produces (NestJS `@Injectable()`):
  - `SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000`
  - `SessionService.createForUser(userId: string): Promise<{ token: string; expiresAt: Date }>` — generates a random token, stores its hash, returns the raw token.
  - `SessionService.resolve(token: string | undefined): Promise<{ userId: string } | null>` — returns null when missing/unknown/expired (and deletes expired rows it encounters).
  - `SessionService.destroy(token: string | undefined): Promise<void>`
  - `SessionService.hashToken(token: string): string` (sha256 hex; exported for tests).

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/domain/auth/session.service.test.ts`:

```typescript
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, { userId: string; expiresAt: Date }>();

vi.mock("@folio/db", () => ({
  sessionsRepo: {
    create: vi.fn(async (input) => {
      store.set(input.tokenHash, { userId: input.userId, expiresAt: input.expiresAt });
      return { id: "s1", ...input, createdAt: new Date(), updatedAt: new Date() };
    }),
    getByTokenHash: vi.fn(async (hash) => {
      const row = store.get(hash);
      return row ? { id: "s1", tokenHash: hash, ...row } : null;
    }),
    deleteByTokenHash: vi.fn(async (hash) => {
      store.delete(hash);
    }),
  },
}));

const { SessionService } = await import("./session.service.js");

describe("SessionService", () => {
  beforeEach(() => store.clear());

  it("creates a session and resolves the raw token back to the user", async () => {
    const svc = new SessionService();
    const { token } = await svc.createForUser("user-1");
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    // Stored hash is sha256 of the token, not the token itself.
    expect(store.has(token)).toBe(false);
    expect(store.has(createHash("sha256").update(token).digest("hex"))).toBe(true);

    const resolved = await svc.resolve(token);
    expect(resolved).toEqual({ userId: "user-1" });
  });

  it("returns null for unknown or missing tokens", async () => {
    const svc = new SessionService();
    expect(await svc.resolve(undefined)).toBeNull();
    expect(await svc.resolve("nope")).toBeNull();
  });

  it("treats expired sessions as invalid and removes them", async () => {
    const svc = new SessionService();
    const { token } = await svc.createForUser("user-1");
    const hash = createHash("sha256").update(token).digest("hex");
    store.set(hash, { userId: "user-1", expiresAt: new Date(Date.now() - 1000) });
    expect(await svc.resolve(token)).toBeNull();
    expect(store.has(hash)).toBe(false);
  });

  it("destroy deletes the session", async () => {
    const svc = new SessionService();
    const { token } = await svc.createForUser("user-1");
    await svc.destroy(token);
    expect(await svc.resolve(token)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @folio/backend test -- session.service`
Expected: FAIL — cannot find module `./session.service.js`.

- [ ] **Step 3: Implement the service**

Create `apps/backend/src/domain/auth/session.service.ts`:

```typescript
import { createHash, randomBytes } from "node:crypto";
import { sessionsRepo } from "@folio/db";
import { Injectable } from "@nestjs/common";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionService {
  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async createForUser(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await sessionsRepo.create({ userId, tokenHash: this.hashToken(token), expiresAt });
    return { token, expiresAt };
  }

  async resolve(token: string | undefined): Promise<{ userId: string } | null> {
    if (!token) {
      return null;
    }
    const hash = this.hashToken(token);
    const row = await sessionsRepo.getByTokenHash(hash);
    if (!row) {
      return null;
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      await sessionsRepo.deleteByTokenHash(hash);
      return null;
    }
    return { userId: row.userId };
  }

  async destroy(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }
    await sessionsRepo.deleteByTokenHash(this.hashToken(token));
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @folio/backend test -- session.service`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/domain/auth/session.service.ts apps/backend/src/domain/auth/session.service.test.ts
git commit -m "feat(backend): session domain service with hashed tokens"
```

---

## Task 6: backend — GitHub OAuth adapter + repo-access service

**Files:**
- Create: `apps/backend/src/infrastructure/github/github-oauth.adapter.ts`
- Create: `apps/backend/src/domain/auth/repo-access.service.ts`
- Test: `apps/backend/src/domain/auth/repo-access.service.test.ts`

**Interfaces:**
- Consumes: `@folio/github` (`buildAuthorizeUrl`, `exchangeOAuthCode`, `getAuthenticatedUser`, `OAuthUser`, `createInstallationOctokit`, `checkUserRepoPermission`), `@folio/db` (`repositoriesRepo`, `installationsRepo`), `config`.
- Produces:
  - `GitHubOAuthAdapter` (`@Injectable()`):
    - `authorizeUrl(state: string): string`
    - `exchangeCodeForUser(code: string): Promise<OAuthUser>` (exchange then `/user`, token discarded)
    - `userCanAccessRepo(owner: string, repo: string, username: string): Promise<boolean>` — resolves repo → installation → installation Octokit → `checkUserRepoPermission`; returns `false` if the repo/installation is unknown to Folio.
  - `RepoAccessService` (`@Injectable()`):
    - `assertAccessAllowed(input: { owner: string; repo: string; username: string }): Promise<boolean>` with a 60s in-memory cache keyed `${username}:${owner}/${repo}`.

- [ ] **Step 1: Write the failing test for the cache behavior**

Create `apps/backend/src/domain/auth/repo-access.service.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { RepoAccessService } from "./repo-access.service.js";

function adapterStub(canAccess: ReturnType<typeof vi.fn>) {
  return { userCanAccessRepo: canAccess } as unknown as ConstructorParameters<
    typeof RepoAccessService
  >[0];
}

const REF = { owner: "acme", repo: "widget", username: "octocat" };

describe("RepoAccessService", () => {
  it("returns the adapter result", async () => {
    const canAccess = vi.fn().mockResolvedValue(true);
    const svc = new RepoAccessService(adapterStub(canAccess));
    expect(await svc.assertAccessAllowed(REF)).toBe(true);
  });

  it("caches a positive result within the TTL (one adapter call)", async () => {
    const canAccess = vi.fn().mockResolvedValue(true);
    const svc = new RepoAccessService(adapterStub(canAccess));
    await svc.assertAccessAllowed(REF);
    await svc.assertAccessAllowed(REF);
    expect(canAccess).toHaveBeenCalledTimes(1);
  });

  it("does not cache a denial (re-checks each time)", async () => {
    const canAccess = vi.fn().mockResolvedValue(false);
    const svc = new RepoAccessService(adapterStub(canAccess));
    await svc.assertAccessAllowed(REF);
    await svc.assertAccessAllowed(REF);
    expect(canAccess).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @folio/backend test -- repo-access.service`
Expected: FAIL — cannot find module `./repo-access.service.js`.

- [ ] **Step 3: Implement the adapter**

Create `apps/backend/src/infrastructure/github/github-oauth.adapter.ts`:

```typescript
import {
  buildAuthorizeUrl,
  checkUserRepoPermission,
  createInstallationOctokit,
  exchangeOAuthCode,
  getAuthenticatedUser,
  type OAuthUser,
} from "@folio/github";
import { installationsRepo, repositoriesRepo } from "@folio/db";
import { Injectable } from "@nestjs/common";
import { config } from "../../config.js";

@Injectable()
export class GitHubOAuthAdapter {
  private callbackUrl(): string {
    return `${config.PUBLIC_API_BASE_URL}/api/v1/auth/github/callback`;
  }

  authorizeUrl(state: string): string {
    return buildAuthorizeUrl({
      clientId: config.GITHUB_APP_CLIENT_ID ?? "",
      redirectUri: this.callbackUrl(),
      state,
    });
  }

  async exchangeCodeForUser(code: string): Promise<OAuthUser> {
    const { accessToken } = await exchangeOAuthCode({
      clientId: config.GITHUB_APP_CLIENT_ID ?? "",
      clientSecret: config.GITHUB_APP_CLIENT_SECRET ?? "",
      code,
    });
    // Token is used once for identity, then discarded (design Model B).
    return getAuthenticatedUser({ accessToken });
  }

  async userCanAccessRepo(owner: string, repo: string, username: string): Promise<boolean> {
    const repoRow = await repositoriesRepo.getByGithubId; // placeholder — see note below
    void repoRow;
    const repository = await this.resolveRepo(owner, repo);
    if (!repository) {
      return false;
    }
    const installation = await installationsRepo.getById(repository.installationId);
    if (!installation) {
      return false;
    }
    const client = await createInstallationOctokit(installation.githubInstallationId);
    return checkUserRepoPermission(client, { owner, repo, username });
  }

  private async resolveRepo(owner: string, repo: string) {
    return repositoriesRepo.getByFullName(`${owner}/${repo}`);
  }
}
```

> Note: this adapter needs `repositoriesRepo.getByFullName`. Add it in the next step. Remove the placeholder `getByGithubId` line above when implementing — it's only here to flag the dependency; the real lookup is `resolveRepo`. Final adapter must not reference `getByGithubId`.

- [ ] **Step 4: Add `getByFullName` to `repositoriesRepo`**

In `packages/db/src/repos/repositories.ts`, add this method to the `repositoriesRepo` object (after `getByGithubId`):

```typescript
  async getByFullName(fullName: string, db: Db = getDb()): Promise<RepositoryRow | null> {
    const [row] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.fullName, fullName))
      .limit(1);
    return row ?? null;
  },
```

Then clean the adapter from Step 3: delete the two placeholder lines (`const repoRow = ...` and `void repoRow;`) so `userCanAccessRepo` starts with `const repository = await this.resolveRepo(...)`.

- [ ] **Step 5: Implement the repo-access service**

Create `apps/backend/src/domain/auth/repo-access.service.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import { GitHubOAuthAdapter } from "../../infrastructure/github/github-oauth.adapter.js";

const CACHE_TTL_MS = 60_000;

/**
 * Live per-viewer repo authorization with a short positive-result cache.
 * Denials are never cached so a granted access reflects within one check.
 */
@Injectable()
export class RepoAccessService {
  private readonly allowCache = new Map<string, number>();

  constructor(private readonly github: GitHubOAuthAdapter) {}

  async assertAccessAllowed(input: {
    owner: string;
    repo: string;
    username: string;
  }): Promise<boolean> {
    const key = `${input.username}:${input.owner}/${input.repo}`;
    const cachedUntil = this.allowCache.get(key);
    if (cachedUntil && cachedUntil > Date.now()) {
      return true;
    }
    const allowed = await this.github.userCanAccessRepo(input.owner, input.repo, input.username);
    if (allowed) {
      this.allowCache.set(key, Date.now() + CACHE_TTL_MS);
    }
    return allowed;
  }
}
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm --filter @folio/backend test -- repo-access.service`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/infrastructure/github/github-oauth.adapter.ts apps/backend/src/domain/auth/repo-access.service.ts apps/backend/src/domain/auth/repo-access.service.test.ts packages/db/src/repos/repositories.ts
git commit -m "feat(backend): GitHub OAuth adapter and cached repo-access service"
```

---

## Task 7: backend — auth error types, facade, guards, and `@CurrentUser`

**Files:**
- Modify: `apps/backend/src/support/error/error-type.ts`
- Create: `apps/backend/src/application/auth/auth.facade.ts`
- Create: `apps/backend/src/interfaces/api/common/session-auth.guard.ts`
- Create: `apps/backend/src/interfaces/api/common/repo-access.guard.ts`
- Create: `apps/backend/src/interfaces/api/common/current-user.decorator.ts`

**Interfaces:**
- Consumes: `SessionService`, `GitHubOAuthAdapter`, `RepoAccessService`, `usersRepo`, `CoreException`, `ErrorType`.
- Produces:
  - `ErrorType.Unauthorized` (401, `unauthorized`), `ErrorType.OAuthStateMismatch` (400, `oauth_state_mismatch`), `ErrorType.RepoAccessDenied` (403, `repo_access_denied`).
  - `AuthFacade.completeLogin(code: string): Promise<{ token: string }>` — exchange → upsert user → create session.
  - `interface AuthedRequest extends Request { user?: { id: string; login: string; avatarUrl: string } }` (exported from the guard file).
  - `SessionAuthGuard` — reads `folio_session` cookie via `SessionService.resolve`, loads the user, attaches `req.user`; throws `CoreException(ErrorType.Unauthorized)` when absent.
  - `RepoAccessGuard` — reads `owner`/`repo` route params + `req.user.login`, calls `RepoAccessService.assertAccessAllowed`; throws `CoreException(ErrorType.RepoAccessDenied)` on deny.
  - `@CurrentUser()` param decorator returning `req.user`.

- [ ] **Step 1: Add the error types**

In `apps/backend/src/support/error/error-type.ts`, add to the `ErrorType` object (before `InternalError`):

```typescript
  Unauthorized: {
    code: "unauthorized",
    statusCode: 401,
    message: "Authentication is required.",
  },
  OAuthStateMismatch: {
    code: "oauth_state_mismatch",
    statusCode: 400,
    message: "OAuth state did not match.",
  },
  RepoAccessDenied: {
    code: "repo_access_denied",
    statusCode: 403,
    message: "You do not have access to this repository.",
  },
```

- [ ] **Step 2: Write the auth facade**

Create `apps/backend/src/application/auth/auth.facade.ts`:

```typescript
import { usersRepo } from "@folio/db";
import { Inject, Injectable } from "@nestjs/common";
import { SessionService } from "../../domain/auth/session.service.js";
import { GitHubOAuthAdapter } from "../../infrastructure/github/github-oauth.adapter.js";

@Injectable()
export class AuthFacade {
  constructor(
    @Inject(GitHubOAuthAdapter) private readonly github: GitHubOAuthAdapter,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  /** Exchange the OAuth code, upsert the GitHub identity, and open a session. */
  async completeLogin(code: string): Promise<{ token: string; expiresAt: Date }> {
    const ghUser = await this.github.exchangeCodeForUser(code);
    const user = await usersRepo.upsertByGithubId({
      githubUserId: ghUser.id,
      login: ghUser.login,
      avatarUrl: ghUser.avatarUrl,
      email: ghUser.email,
    });
    return this.sessions.createForUser(user.id);
  }
}
```

- [ ] **Step 3: Write the `@CurrentUser` decorator**

Create `apps/backend/src/interfaces/api/common/current-user.decorator.ts`:

```typescript
import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
```

- [ ] **Step 4: Write the session guard**

Create `apps/backend/src/interfaces/api/common/session-auth.guard.ts`:

```typescript
import { usersRepo } from "@folio/db";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { SessionService } from "../../../domain/auth/session.service.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";

export interface AuthedUser {
  id: string;
  login: string;
  avatarUrl: string;
}

export interface AuthedRequest extends Request {
  user?: AuthedUser;
  cookies?: Record<string, string>;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = request.cookies?.folio_session;
    const resolved = await this.sessions.resolve(token);
    if (!resolved) {
      throw new CoreException(ErrorType.Unauthorized);
    }
    const user = await usersRepo.getById(resolved.userId);
    if (!user) {
      throw new CoreException(ErrorType.Unauthorized);
    }
    request.user = { id: user.id, login: user.login, avatarUrl: user.avatarUrl };
    return true;
  }
}
```

- [ ] **Step 5: Write the repo-access guard**

Create `apps/backend/src/interfaces/api/common/repo-access.guard.ts`:

```typescript
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { RepoAccessService } from "../../../domain/auth/repo-access.service.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import type { AuthedRequest } from "./session-auth.guard.js";

/**
 * Authorizes a PR-scoped request against the logged-in user's GitHub access to
 * the `:owner/:repo` in the route. Runs after SessionAuthGuard (needs req.user).
 */
@Injectable()
export class RepoAccessGuard implements CanActivate {
  constructor(@Inject(RepoAccessService) private readonly access: RepoAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const owner = request.params?.owner;
    const repo = request.params?.repo;
    const user = request.user;
    if (!owner || !repo || !user) {
      throw new CoreException(ErrorType.RepoAccessDenied);
    }
    const allowed = await this.access.assertAccessAllowed({
      owner,
      repo,
      username: user.login,
    });
    if (!allowed) {
      throw new CoreException(ErrorType.RepoAccessDenied);
    }
    return true;
  }
}
```

- [ ] **Step 6: Verify typecheck**

Run: `pnpm --filter @folio/backend typecheck`
Expected: PASS. (Behavioral coverage for the guards comes through the controller test in Task 8.)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/support/error/error-type.ts apps/backend/src/application/auth/auth.facade.ts apps/backend/src/interfaces/api/common/current-user.decorator.ts apps/backend/src/interfaces/api/common/session-auth.guard.ts apps/backend/src/interfaces/api/common/repo-access.guard.ts
git commit -m "feat(backend): auth facade, session/repo-access guards, error types"
```

---

## Task 8: backend — auth controller + module wiring + integration test

**Files:**
- Create: `apps/backend/src/interfaces/api/auth/auth.controller.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/src/interfaces/api/auth/auth.controller.test.ts`

**Interfaces:**
- Consumes: `AuthFacade`, `SessionService`, `GitHubOAuthAdapter`, `cookieIsSecure`, `config`, `@CurrentUser`, `SessionAuthGuard`.
- Produces routes under `api/v1/auth`:
  - `GET /login?redirect=` → 302 to GitHub; sets `folio_oauth_state` cookie (`<state>|<redirectPath>`).
  - `GET /callback?code&state` → validates state cookie, `completeLogin`, sets `folio_session` cookie, clears state cookie, 302 to `WEB_ORIGIN + redirectPath`.
  - `GET /me` (guarded) → `{ user }`.
  - `POST /logout` → destroys session, clears cookie, `{ ok: true }`.

- [ ] **Step 1: Write the controller**

Create `apps/backend/src/interfaces/api/auth/auth.controller.ts`:

```typescript
import { randomBytes } from "node:crypto";
import { Controller, Get, Inject, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthFacade } from "../../../application/auth/auth.facade.js";
import { config, cookieIsSecure } from "../../../config.js";
import { SessionService } from "../../../domain/auth/session.service.js";
import { GitHubOAuthAdapter } from "../../../infrastructure/github/github-oauth.adapter.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { type AuthedRequest, type AuthedUser, SessionAuthGuard } from "../common/session-auth.guard.js";

const STATE_COOKIE = "folio_oauth_state";
const SESSION_COOKIE = "folio_session";
const STATE_TTL_MS = 10 * 60 * 1000;

/** Only allow same-site relative redirect targets (no open redirect). */
function safeRedirectPath(raw: string | undefined): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  return "/";
}

@Controller("api/v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthFacade) private readonly auth: AuthFacade,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(GitHubOAuthAdapter) private readonly github: GitHubOAuthAdapter,
  ) {}

  @Get("github/login")
  login(@Query("redirect") redirect: string | undefined, @Res() res: Response): void {
    const state = randomBytes(16).toString("hex");
    const redirectPath = safeRedirectPath(redirect);
    res.cookie(STATE_COOKIE, `${state}|${redirectPath}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieIsSecure(),
      maxAge: STATE_TTL_MS,
      path: "/",
    });
    res.redirect(this.github.authorizeUrl(state));
  }

  @Get("github/callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const cookie = req.cookies?.[STATE_COOKIE];
    const [expectedState, redirectPath = "/"] = (cookie ?? "").split("|");
    if (!code || !state || !expectedState || state !== expectedState) {
      throw new CoreException(ErrorType.OAuthStateMismatch);
    }
    const { token, expiresAt } = await this.auth.completeLogin(code);
    res.clearCookie(STATE_COOKIE, { path: "/" });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieIsSecure(),
      expires: expiresAt,
      path: "/",
    });
    res.redirect(`${config.WEB_ORIGIN}${safeRedirectPath(redirectPath)}`);
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: AuthedUser): { user: AuthedUser } {
    return { user };
  }

  @Post("logout")
  async logout(@Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    await this.sessions.destroy(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(200).json({ success: true, data: { ok: true } });
  }
}
```

> The `me` route returns a plain object so the global `ApiResponseInterceptor` wraps it in the envelope. `login`/`callback`/`logout` use `@Res()` directly (redirects / manual JSON), which bypasses the interceptor — that's intentional for redirects.

- [ ] **Step 2: Register providers in the module**

In `apps/backend/src/app.module.ts`, add imports and register the new providers + controller:

```typescript
import { AuthFacade } from "./application/auth/auth.facade.js";
import { SessionService } from "./domain/auth/session.service.js";
import { RepoAccessService } from "./domain/auth/repo-access.service.js";
import { GitHubOAuthAdapter } from "./infrastructure/github/github-oauth.adapter.js";
import { SessionAuthGuard } from "./interfaces/api/common/session-auth.guard.js";
import { RepoAccessGuard } from "./interfaces/api/common/repo-access.guard.js";
import { AuthController } from "./interfaces/api/auth/auth.controller.js";
```

Add `AuthController` to `controllers`, and add to `providers`: `AuthFacade`, `SessionService`, `RepoAccessService`, `GitHubOAuthAdapter`, `SessionAuthGuard`, `RepoAccessGuard`.

- [ ] **Step 3: Write the integration test**

Create `apps/backend/src/interfaces/api/auth/auth.controller.test.ts`:

```typescript
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const upsertByGithubId = vi.fn();
const getById = vi.fn();
const sessionStore = new Map<string, { userId: string; expiresAt: Date }>();

vi.mock("@folio/db", () => ({
  usersRepo: {
    upsertByGithubId: (...args: unknown[]) => upsertByGithubId(...args),
    getById: (...args: unknown[]) => getById(...args),
  },
  sessionsRepo: {
    create: vi.fn(async (input: { tokenHash: string; userId: string; expiresAt: Date }) => {
      sessionStore.set(input.tokenHash, { userId: input.userId, expiresAt: input.expiresAt });
      return { id: "s1", ...input };
    }),
    getByTokenHash: vi.fn(async (hash: string) => {
      const row = sessionStore.get(hash);
      return row ? { id: "s1", tokenHash: hash, ...row } : null;
    }),
    deleteByTokenHash: vi.fn(async (hash: string) => {
      sessionStore.delete(hash);
    }),
  },
  repositoriesRepo: { getByFullName: vi.fn() },
  installationsRepo: { getById: vi.fn() },
}));

// Identity comes from the OAuth adapter; stub it so no network/crypto is hit.
vi.mock("@folio/github", async () => {
  const actual = await vi.importActual<typeof import("@folio/github")>("@folio/github");
  return {
    ...actual,
    exchangeOAuthCode: vi.fn(async () => ({ accessToken: "gho_x" })),
    getAuthenticatedUser: vi.fn(async () => ({
      id: 7,
      login: "octocat",
      avatarUrl: "https://avatars/octocat",
      email: null,
    })),
  };
});

async function createServer() {
  vi.resetModules();
  const cookieParser = (await import("cookie-parser")).default;
  const { AppModule } = await import("../../../app.module.js");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.use(cookieParser());
  await app.init();
  return app;
}

describe("auth routes", () => {
  afterEach(() => {
    sessionStore.clear();
    vi.clearAllMocks();
  });

  it("login redirects to GitHub and sets a state cookie", async () => {
    const app = await createServer();
    const res = await request(app.getHttpServer()).get("/api/v1/auth/github/login?redirect=/x");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("https://github.com/login/oauth/authorize");
    expect(res.headers["set-cookie"].join()).toContain("folio_oauth_state");
    await app.close();
  });

  it("rejects a callback whose state does not match the cookie", async () => {
    const app = await createServer();
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/github/callback?code=c&state=wrong")
      .set("Cookie", "folio_oauth_state=right|/");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("oauth_state_mismatch");
    await app.close();
  });

  it("completes login on a valid callback and sets the session cookie", async () => {
    upsertByGithubId.mockResolvedValue({
      id: "u1",
      login: "octocat",
      avatarUrl: "https://avatars/octocat",
    });
    const app = await createServer();
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/github/callback?code=good&state=s1")
      .set("Cookie", "folio_oauth_state=s1|/dashboard");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/dashboard");
    expect(res.headers["set-cookie"].join()).toContain("folio_session");
    await app.close();
  });

  it("me returns 401 without a session", async () => {
    const app = await createServer();
    const res = await request(app.getHttpServer()).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
    await app.close();
  });

  it("me returns the user with a valid session cookie", async () => {
    getById.mockResolvedValue({ id: "u1", login: "octocat", avatarUrl: "https://a" });
    upsertByGithubId.mockResolvedValue({ id: "u1", login: "octocat", avatarUrl: "https://a" });
    const app = await createServer();
    // Drive a real login to mint a valid session cookie.
    const login = await request(app.getHttpServer())
      .get("/api/v1/auth/github/callback?code=good&state=s1")
      .set("Cookie", "folio_oauth_state=s1|/");
    const sessionCookie = (login.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("folio_session="),
    );
    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", sessionCookie ?? "");
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ success: true, data: { user: { login: "octocat" } } });
    await app.close();
  });
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @folio/backend test -- auth.controller`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full backend suite**

Run: `pnpm --filter @folio/backend test`
Expected: PASS (health, webhook, config, session, repo-access, auth).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/interfaces/api/auth/auth.controller.ts apps/backend/src/app.module.ts apps/backend/src/interfaces/api/auth/auth.controller.test.ts
git commit -m "feat(backend): GitHub OAuth login/callback/me/logout routes"
```

---

## Task 9: web — API client credentials, auth lib, login wiring, app-wide gate, top-bar

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/middleware.ts`
- Modify: `apps/web/src/components/review/top-bar.tsx`

**Interfaces:**
- Consumes: `webEnv.apiBaseUrl`, backend routes `api/v1/auth/*`.
- Produces:
  - `apiRequest` now sends `credentials: "include"`.
  - `lib/auth.ts`: `loginUrl(redirectPath?: string): string`, `logoutUrl(): string`, `getMe(): Promise<{ login: string; avatarUrl: string } | null>`.
  - `middleware.ts`: redirects unauthenticated users to `/login` (presence-of-cookie gate).

- [ ] **Step 1: Send credentials from the API client**

In `apps/web/src/lib/api-client.ts`, in `apiRequest`, add `credentials: "include"` to the `fetch` options:

```typescript
  const response = await fetch(new URL(path, baseUrl), {
    ...requestInit,
    credentials: "include",
    headers: {
      accept: "application/json",
      ...requestInit.headers,
    },
  });
```

- [ ] **Step 2: Add the auth lib**

Create `apps/web/src/lib/auth.ts`:

```typescript
import { webEnv } from "./env.js";

export function loginUrl(redirectPath = "/"): string {
  const url = new URL("/api/v1/auth/github/login", webEnv.apiBaseUrl);
  url.searchParams.set("redirect", redirectPath);
  return url.toString();
}

export function logoutUrl(): string {
  return new URL("/api/v1/auth/logout", webEnv.apiBaseUrl).toString();
}

export interface SessionUser {
  login: string;
  avatarUrl: string;
}

/** Returns the current user, or null when unauthenticated. */
export async function getMe(): Promise<SessionUser | null> {
  const res = await fetch(new URL("/api/v1/auth/me", webEnv.apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    return null;
  }
  const payload = (await res.json()) as { success: boolean; data?: { user: SessionUser } };
  return payload.success && payload.data ? payload.data.user : null;
}
```

- [ ] **Step 3: Wire the login button**

Replace the two buttons at the bottom of `apps/web/src/app/login/page.tsx` so the primary one points at the backend OAuth login (drop the "mock dashboard" button to honor app-wide protection):

```tsx
import { loginUrl } from "@/lib/auth";
// ...
        <Button asChild className="mt-6 w-full">
          <a href={loginUrl("/")}>
            <Github className="size-4" />
            GitHub로 계속하기
          </a>
        </Button>
```

(Remove the now-unused `Link` import if nothing else uses it.)

- [ ] **Step 4: Add the app-wide gate**

Create `apps/web/src/middleware.ts`:

```typescript
import { type NextRequest, NextResponse } from "next/server";

// Public paths: the login screen and Next internals/assets.
const PUBLIC_PREFIXES = ["/login", "/_next", "/favicon"];

/**
 * App-wide session gate: redirect to /login when the session cookie is absent.
 * Real authorization (and private-repo access) is enforced by the backend; this
 * is the coarse UX gate so unauthenticated users never see app chrome.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.has("folio_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

> The middleware checks cookie *presence* only (it can't validate the hash). The backend rejects forged/expired cookies with 401; the API client's 401 handling (next step) bounces those back to `/login`.

- [ ] **Step 5: Redirect to /login on 401 from the API client**

In `apps/web/src/lib/api-client.ts`, after computing `response` and before parsing, handle 401 in the browser:

```typescript
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }
```

- [ ] **Step 6: Add user avatar + logout to the top bar**

Read `apps/web/src/components/review/top-bar.tsx` first. Add a logout control that posts to the backend then sends the user to `/login`. Minimal addition (adapt to the file's existing structure/props — keep its current layout, append to the right cluster):

```tsx
import { logoutUrl } from "@/lib/auth";
// inside the component's right-hand controls:
        <button
          type="button"
          onClick={async () => {
            await fetch(logoutUrl(), { method: "POST", credentials: "include" });
            window.location.href = "/login";
          }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          로그아웃
        </button>
```

- [ ] **Step 7: Typecheck + build the web app**

Run: `pnpm --filter @folio/web typecheck && pnpm --filter @folio/web build`
Expected: PASS (Next build completes; middleware compiles).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/api-client.ts apps/web/src/lib/auth.ts apps/web/src/app/login/page.tsx apps/web/src/middleware.ts apps/web/src/components/review/top-bar.tsx
git commit -m "feat(web): GitHub OAuth login wiring, session gate, logout"
```

---

## Task 10: Apply guards to PR data routes + final verification

**Files:**
- Modify: `apps/backend/src/interfaces/api/pulls/pulls.controller.ts`
- Modify: `apps/backend/src/interfaces/api/backend-api.test.ts`

**Interfaces:**
- Consumes: `SessionAuthGuard`, `RepoAccessGuard`.
- Produces: PR data routes that require a session; repo-scoped routes additionally require repo access. (The current stub routes are keyed by `:id`; add the `owner/repo` route shape the guard expects for any repo-scoped endpoint.)

- [ ] **Step 1: Guard the pulls controller**

Update `apps/backend/src/interfaces/api/pulls/pulls.controller.ts` so the list requires a session and the repo-scoped chapters route requires repo access. Use the `:owner/:repo` params the `RepoAccessGuard` reads:

```typescript
import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { RepoAccessGuard } from "../common/repo-access.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";

@Controller("api/v1/pulls")
@UseGuards(SessionAuthGuard)
export class PullsController {
  @Get()
  listPulls() {
    // TODO(B2): list in-flight PRs from the database.
    return [];
  }

  @Get(":owner/:repo/:number/chapters")
  @UseGuards(RepoAccessGuard)
  getChapters(
    @Param("owner") _owner: string,
    @Param("repo") _repo: string,
    @Param("number") _number: string,
  ) {
    // TODO(B2): load decomposition (prologue + ordered chapters) for the PR.
    return { chapters: [], prologue: null };
  }
}
```

- [ ] **Step 2: Update the existing API stub test**

In `apps/backend/src/interfaces/api/backend-api.test.ts`, the "keeps the PR review API stubs available" test now hits guarded routes. Update it to assert that unauthenticated access is rejected:

```typescript
  it("requires a session for the PR review API", async () => {
    const app = await createTestServer();
    const pulls = await request(app.getHttpServer()).get("/api/v1/pulls");
    expect(pulls.status).toBe(401);
    expect(pulls.body.error.code).toBe("unauthorized");
    await app.close();
  });
```

(Keep the health test unchanged.)

- [ ] **Step 3: Run the full backend suite**

Run: `pnpm --filter @folio/backend test`
Expected: PASS.

- [ ] **Step 4: Full repo verification**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all PASS. (DB e2e tests need Postgres — run `pnpm db:up` first; otherwise they self-skip.)

- [ ] **Step 5: Manual smoke (requires GitHub App callback URL + private key configured)**

1. Ensure `.env` has `GITHUB_APP_PRIVATE_KEY` populated and the App's OAuth **Callback URL** is `http://localhost:8080/api/v1/auth/github/callback`.
2. Start: `pnpm db:up`, `pnpm dev:backend`, `pnpm dev:web`.
3. Visit `http://localhost:5173` → redirected to `/login`.
4. Click "GitHub로 계속하기" → GitHub authorize → back to the app with a `folio_session` cookie.
5. `curl -s http://localhost:8080/api/v1/auth/me -H "Cookie: folio_session=<value>"` returns the user envelope.
6. Hitting a chapters route for a repo you can't access returns `403 repo_access_denied`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/interfaces/api/pulls/pulls.controller.ts apps/backend/src/interfaces/api/backend-api.test.ts
git commit -m "feat(backend): require session + repo access on PR data routes"
```

---

## Self-Review Notes (coverage vs. spec)

- Identity-only OAuth (token discarded): Task 2 (helpers) + Task 6 adapter `exchangeCodeForUser` + Task 7 facade. ✅
- DB session + httpOnly cookie + `token_hash`: Task 1 + Task 5 + Task 8 cookie handling. ✅
- Live installation-token repo authorization + 60s positive cache: Task 3 + Task 6 + Task 7 guard. ✅
- App-wide protection (only `/login` + callback public): Task 9 middleware + Task 10 guards. ✅
- Config (`CLIENT_ID/SECRET/SLUG`, callback base, cookie secure) + GitHub bootstrap: Task 4. ✅
- Error envelope (401/400/403): Task 7 error types, surfaced via existing `CoreExceptionFilter`. ✅
- Tests per layer (github unit, db e2e, backend domain + integration): Tasks 1–3, 5, 6, 8, 10. ✅
- Open implementation check (collaborator-permission endpoint vs App permissions): exercised in Task 10 Step 5 manual smoke; if it 403s on permission grounds, swap `checkUserRepoPermission`'s client for a per-user-token call without touching callers.
- Prerequisites (Callback URL, `GITHUB_APP_PRIVATE_KEY`): Task 10 Step 5.
```

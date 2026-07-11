# RBAC Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Folio a three-axis authorization model — live GitHub access, Folio workspace roles, and a subscription-ready (but not-yet-enforcing) entitlement seam — replacing the hardcoded `ADMIN_LOGIN` and boolean repo checks.

**Architecture:** Clean layered NestJS backend (`domain` pure policy → `infrastructure` adapters → `application` facades → `interfaces` guards/controllers), a `@folio/types` Zod spine for shared enums, and Drizzle-backed tables (`workspaces`, `workspace_members`, `audit_logs`) plus extensions to `users`/`installations`/`repositories`. Frontend adds a permission context that gates settings sections by role.

**Tech Stack:** TypeScript ESM, pnpm workspaces, Drizzle ORM + Postgres, NestJS, Next.js App Router, Zod, vitest.

## Global Constraints

- Backend clean layers: `interfaces` (controllers/guards/filters), `application` (facades), `domain` (pure rules), `infrastructure` (adapters), `internal`, `support`. Copied verbatim from AGENTS.md.
- All API responses use the common envelope (`successResponse` / `ApiResponseInterceptor`); errors throw `CoreException(ErrorType.*)`.
- Shared types are real `.ts` Zod modules in `@folio/types`, never `.d.ts`.
- No file/module named `helpers`, `utils`, `common`, `misc`, `shared`; name by concrete concept.
- Frontend is dark-mode only; use OKLCH tokens from `apps/web/src/app/globals.css` and shadcn primitives in `apps/web/src/components/ui/`. No new color/font/shadow values.
- Frontend API calls go through `apps/web/src/lib/api-client.ts` (`apiRequest`) or the `fetch` pattern in `apps/web/src/lib/auth.ts`.
- Never add a `max-lines` disable (split the file). Never bypass hooks with `--no-verify`.
- Conversation/UI copy that is Korean-facing stays Korean (match existing `apps/web` strings).
- Subscription/billing is OUT OF SCOPE: no plan/subscription tables, payment provider, billing webhook, or checkout. The existing unused `subscriptions` table/repo/types are left untouched.
- `system_admin` never bypasses the GitHub access axis to private repo data (Decision 5).
- Final verification (repo root): `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`.

## Database Migration Gate

Tasks 2–7 change `packages/db` schema. Migrations are generated with `pnpm --filter @folio/db db:generate` and are a **mandatory human decision gate**: after generating each migration SQL, STOP and have the operator review the generated file before it is applied. The backfill (Task 7) runs as an explicit data migration, and constraint-tightening (owner-per-workspace, single-system-admin) happens only after backfill.

## File Structure

**`packages/types/src/`**
- `authorization.ts` (new) — `WORKSPACE_ROLE`, `MEMBERSHIP_STATUS`, `GLOBAL_STATUS`, `SYSTEM_ROLE`, `AUDIT_ACTION`, `ENTITLEMENT_FEATURE` const-enums + Zod schemas.

**`packages/db/src/schema/`**
- `workspaces.ts`, `workspace-members.ts`, `audit-logs.ts` (new); `users.ts`, `installations.ts`, `repositories.ts` (extend); `index.ts` (export new).

**`packages/db/src/repos/`**
- `workspaces.ts`, `workspace-members.ts`, `audit-logs.ts` (new); `users.ts` (extend); `index.ts` (export new).

**`apps/backend/src/domain/authorization/`** (new dir)
- `workspace-role.model.ts` — role/status value objects + membership type.
- `authorization-policy.ts` — pure decision functions.
- `entitlement.service.ts` — `EntitlementService` interface + `AlwaysEntitledService`.

**`apps/backend/src/infrastructure/authorization/`** (new dir)
- `workspace-resolver.ts` — GitHub numeric account id → workspace.
- `workspace-membership.service.ts` — membership reads/writes + audit writes.

**`apps/backend/src/domain/auth/repo-access.service.ts`** (modify) — return action-specific level.
**`packages/github/src/repo-permission.ts`** (modify) — return level, not boolean.

**`apps/backend/src/interfaces/api/authorization/`** (new dir)
- `require-workspace-role.decorator.ts`, `workspace-role.guard.ts`
- `require-global-status.decorator.ts`, `require-system-admin.decorator.ts`, `global-status.guard.ts`, `system-admin.guard.ts`
- `require-entitlement.decorator.ts`, `entitlement.guard.ts`

**`apps/backend/src/application/authorization/`** (new dir)
- `workspace-members.facade.ts`, `global-users.facade.ts`, `workspace-claim.facade.ts`, `authorization.module.ts`

**`apps/backend/src/interfaces/api/`**
- `workspaces/workspace-members.controller.ts`, `workspaces/workspace.controller.ts`, `admin/global-users.controller.ts` (new).

**`apps/web/src/`**
- `lib/workspace-permission.ts` (new) — client permission context loader.
- `components/settings/workspace-members-admin.tsx` (new), `components/settings/system-users-admin.tsx` (new, folds `pending-users-admin.tsx`).
- `app/settings/workspaces/page.tsx`, `components/repository-toggle-form.tsx` (modify).

---

## Task 1: Authorization types in `@folio/types`

**Files:**
- Create: `packages/types/src/authorization.ts`
- Modify: `packages/types/src/index.ts`
- Test: `packages/types/test/authorization.test.ts`

**Interfaces:**
- Produces: `WORKSPACE_ROLE` (`owner`/`admin`/`reviewer`), `MEMBERSHIP_STATUS` (`active`/`suspended`), `GLOBAL_STATUS` (`pending`/`active`/`suspended`), `AUDIT_ACTION`, `ENTITLEMENT_FEATURE` const objects + their `WorkspaceRole`, `MembershipStatus`, `GlobalStatus`, `AuditAction`, `EntitlementFeature` types and matching Zod schemas (`WorkspaceRoleSchema`, etc.). Consumed by every later task.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/types/test/authorization.test.ts
import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION,
  ENTITLEMENT_FEATURE,
  GLOBAL_STATUS,
  MEMBERSHIP_STATUS,
  WORKSPACE_ROLE,
  WorkspaceRoleSchema,
} from "../src/authorization.js";

describe("authorization types", () => {
  it("exposes the fixed workspace roles", () => {
    expect(Object.values(WORKSPACE_ROLE)).toEqual(["owner", "admin", "reviewer"]);
  });

  it("exposes membership and global status values", () => {
    expect(Object.values(MEMBERSHIP_STATUS)).toEqual(["active", "suspended"]);
    expect(Object.values(GLOBAL_STATUS)).toEqual(["pending", "active", "suspended"]);
  });

  it("lists the audited actions and gated features", () => {
    expect(AUDIT_ACTION.OWNER_TRANSFER).toBe("owner_transfer");
    expect(ENTITLEMENT_FEATURE.PR_ANALYSIS).toBe("pr_analysis");
  });

  it("validates a role via schema and rejects unknown roles", () => {
    expect(WorkspaceRoleSchema.parse("admin")).toBe("admin");
    expect(WorkspaceRoleSchema.safeParse("viewer").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/types test authorization`
Expected: FAIL — `Cannot find module '../src/authorization.js'`.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/types/src/authorization.ts
import { enumFromConst } from "./common.js";

export const WORKSPACE_ROLE = {
  OWNER: "owner",
  ADMIN: "admin",
  REVIEWER: "reviewer",
} as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLE)[keyof typeof WORKSPACE_ROLE];
export const WorkspaceRoleSchema = enumFromConst(WORKSPACE_ROLE);

export const MEMBERSHIP_STATUS = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
} as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[keyof typeof MEMBERSHIP_STATUS];
export const MembershipStatusSchema = enumFromConst(MEMBERSHIP_STATUS);

export const GLOBAL_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
} as const;
export type GlobalStatus = (typeof GLOBAL_STATUS)[keyof typeof GLOBAL_STATUS];
export const GlobalStatusSchema = enumFromConst(GLOBAL_STATUS);

// Only the state changes Decision 14 requires to be audited.
export const AUDIT_ACTION = {
  USER_APPROVE: "user_approve",
  USER_SUSPEND: "user_suspend",
  MEMBER_SUSPEND: "member_suspend",
  MEMBER_RESTORE: "member_restore",
  ROLE_CHANGE: "role_change",
  OWNER_TRANSFER: "owner_transfer",
  REPO_ACTIVATION_CHANGE: "repo_activation_change",
} as const;
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
export const AuditActionSchema = enumFromConst(AUDIT_ACTION);

// USER-scoped product capabilities gated by a future subscription (Decision 12).
export const ENTITLEMENT_FEATURE = {
  REPO_ACTIVATION: "repo_activation",
  PR_ANALYSIS: "pr_analysis",
  REVIEW_READ: "review_read",
  REVIEW_STATE_MUTATION: "review_state_mutation",
  COMMENT: "comment",
} as const;
export type EntitlementFeature =
  (typeof ENTITLEMENT_FEATURE)[keyof typeof ENTITLEMENT_FEATURE];
export const EntitlementFeatureSchema = enumFromConst(ENTITLEMENT_FEATURE);
```

Then add to `packages/types/src/index.ts` (alphabetical position, after `./api.js`):

```typescript
export * from "./authorization.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @folio/types test authorization`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/authorization.ts packages/types/src/index.ts packages/types/test/authorization.test.ts
git commit -m "feat(types): add RBAC authorization enums and schemas"
```

---

## Task 2: `workspaces` schema + repo

**Files:**
- Create: `packages/db/src/schema/workspaces.ts`, `packages/db/src/repos/workspaces.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/repos/index.ts`, `packages/db/test/helpers/db.ts` (add `workspaces` to truncate list)
- Test: `packages/db/test/workspaces.e2e.test.ts`

**Interfaces:**
- Consumes: `ACCOUNT_TYPE` from `@folio/types`, `baseColumns` from `./columns.js`.
- Produces: `workspaces` table, `WorkspaceRow`/`WorkspaceInsert`, `workspacesRepo` with `create`, `getByGithubAccountId(githubAccountId: number)`, `getById(id: string)`, `upsertByGithubAccountId(input)`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/test/workspaces.e2e.test.ts
import { ACCOUNT_TYPE } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { workspacesRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

d("workspacesRepo (e2e)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });
  afterAll(async () => {
    await closeDb();
  });

  it("creates and looks up a workspace by stable github account id", async () => {
    const created = await workspacesRepo.create(
      { githubAccountId: 42, accountLogin: "acme", accountType: ACCOUNT_TYPE.ORGANIZATION },
      db,
    );
    const found = await workspacesRepo.getByGithubAccountId(42, db);
    expect(found?.id).toBe(created.id);
    expect(found?.accountLogin).toBe("acme");
  });

  it("upsert keeps the same row across a login rename (reinstall survival)", async () => {
    const first = await workspacesRepo.upsertByGithubAccountId(
      { githubAccountId: 7, accountLogin: "old", accountType: ACCOUNT_TYPE.USER },
      db,
    );
    const second = await workspacesRepo.upsertByGithubAccountId(
      { githubAccountId: 7, accountLogin: "new", accountType: ACCOUNT_TYPE.USER },
      db,
    );
    expect(second.id).toBe(first.id);
    expect(second.accountLogin).toBe("new");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/db test workspaces`
Expected: FAIL — `workspacesRepo` is not exported.

- [ ] **Step 3: Write the schema and repo**

```typescript
// packages/db/src/schema/workspaces.ts
import { ACCOUNT_TYPE } from "@folio/types";
import { bigint, pgTable, text } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";

// Stable authorization boundary, keyed by the GitHub numeric account id so it
// survives App reinstall (accountLogin is display-only and may change).
export const workspaces = pgTable("workspaces", {
  ...baseColumns(),
  githubAccountId: bigint("github_account_id", { mode: "number" }).notNull().unique(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type", {
    enum: [ACCOUNT_TYPE.USER, ACCOUNT_TYPE.ORGANIZATION],
  }).notNull(),
});

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type WorkspaceInsert = typeof workspaces.$inferInsert;
```

```typescript
// packages/db/src/repos/workspaces.ts
import { eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type WorkspaceInsert, type WorkspaceRow, workspaces } from "../schema/workspaces.js";

export const workspacesRepo = {
  async create(input: WorkspaceInsert, db: Db = getDb()): Promise<WorkspaceRow> {
    const [row] = await db.insert(workspaces).values(input).returning();
    if (!row) {
      throw new Error("workspacesRepo.create: insert returned no row");
    }
    return row;
  },

  async getById(id: string, db: Db = getDb()): Promise<WorkspaceRow | null> {
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return row ?? null;
  },

  async getByGithubAccountId(
    githubAccountId: number,
    db: Db = getDb(),
  ): Promise<WorkspaceRow | null> {
    const [row] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.githubAccountId, githubAccountId))
      .limit(1);
    return row ?? null;
  },

  async upsertByGithubAccountId(input: WorkspaceInsert, db: Db = getDb()): Promise<WorkspaceRow> {
    const [row] = await db
      .insert(workspaces)
      .values(input)
      .onConflictDoUpdate({
        target: workspaces.githubAccountId,
        set: {
          accountLogin: input.accountLogin,
          accountType: input.accountType,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) {
      throw new Error("workspacesRepo.upsertByGithubAccountId: insert returned no row");
    }
    return row;
  },
};
```

Add to `packages/db/src/schema/index.ts`: `export * from "./workspaces.js";`
Add to `packages/db/src/repos/index.ts`: `export * from "./workspaces.js";`
Add `"workspaces"` to the `tables` array in `packages/db/test/helpers/db.ts` (before `"installations"`, since repositories/installations reference it after Task 7).

- [ ] **Step 4: Generate migration (GATE) and run test**

Run: `pnpm --filter @folio/db db:generate`
Then STOP: have the operator review the generated migration SQL for the `workspaces` table.
Run: `pnpm --filter @folio/db test workspaces`
Expected: PASS if `SUPABASE_DATABASE_URL` is set; SKIPPED otherwise (both are acceptable — the migration review is the real gate here).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/workspaces.ts packages/db/src/repos/workspaces.ts packages/db/src/schema/index.ts packages/db/src/repos/index.ts packages/db/test/helpers/db.ts packages/db/test/workspaces.e2e.test.ts packages/db/drizzle
git commit -m "feat(db): add workspaces table keyed by stable github account id"
```

---

## Task 3: `workspace_members` schema + repo

**Files:**
- Create: `packages/db/src/schema/workspace-members.ts`, `packages/db/src/repos/workspace-members.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/repos/index.ts`, `packages/db/test/helpers/db.ts` (add `workspace_members` to truncate list, before `workspaces`)
- Test: `packages/db/test/workspace-members.e2e.test.ts`

**Interfaces:**
- Consumes: `WORKSPACE_ROLE`, `MEMBERSHIP_STATUS` from `@folio/types`; `workspaces`, `users` tables.
- Produces: `workspaceMembers` table (with `uniqueIndex` on `(workspace_id, user_id)` and a **partial unique index** `one_owner_per_workspace` on `workspace_id WHERE role = 'owner'`), `WorkspaceMemberRow`/`WorkspaceMemberInsert`, `workspaceMembersRepo` with `getMembership(workspaceId, userId)`, `listByWorkspace(workspaceId)`, `create(input)`, `updateRole(id, role, elevatedBy)`, `updateStatus(id, status, suspendedBy)`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/test/workspace-members.e2e.test.ts
import { ACCOUNT_TYPE, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { usersRepo, workspaceMembersRepo, workspacesRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

d("workspaceMembersRepo (e2e)", () => {
  let db: Db;
  let workspaceId: string;
  let userId: string;
  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
    const ws = await workspacesRepo.create(
      { githubAccountId: 1, accountLogin: "acme", accountType: ACCOUNT_TYPE.ORGANIZATION },
      db,
    );
    workspaceId = ws.id;
    const user = await usersRepo.create(
      { githubUserId: 100, login: "octocat", avatarUrl: "x" },
      db,
    );
    userId = user.id;
  });
  afterAll(async () => {
    await closeDb();
  });

  it("creates and reads a membership", async () => {
    await workspaceMembersRepo.create(
      { workspaceId, userId, role: WORKSPACE_ROLE.REVIEWER, status: MEMBERSHIP_STATUS.ACTIVE },
      db,
    );
    const found = await workspaceMembersRepo.getMembership(workspaceId, userId, db);
    expect(found?.role).toBe(WORKSPACE_ROLE.REVIEWER);
    expect(found?.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
  });

  it("rejects a second owner in the same workspace", async () => {
    const other = await usersRepo.create({ githubUserId: 200, login: "hubot", avatarUrl: "x" }, db);
    await workspaceMembersRepo.create(
      { workspaceId, userId, role: WORKSPACE_ROLE.OWNER, status: MEMBERSHIP_STATUS.ACTIVE },
      db,
    );
    await expect(
      workspaceMembersRepo.create(
        {
          workspaceId,
          userId: other.id,
          role: WORKSPACE_ROLE.OWNER,
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        db,
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/db test workspace-members`
Expected: FAIL — `workspaceMembersRepo` not exported.

- [ ] **Step 3: Write the schema and repo**

```typescript
// packages/db/src/schema/workspace-members.ts
import { MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { text } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { users } from "./users.js";
import { workspaces } from "./workspaces.js";

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    ...baseColumns(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: [WORKSPACE_ROLE.OWNER, WORKSPACE_ROLE.ADMIN, WORKSPACE_ROLE.REVIEWER],
    }).notNull(),
    status: text("status", {
      enum: [MEMBERSHIP_STATUS.ACTIVE, MEMBERSHIP_STATUS.SUSPENDED],
    }).notNull(),
    elevatedBy: uuid("elevated_by").references(() => users.id, { onDelete: "set null" }),
    suspendedBy: uuid("suspended_by").references(() => users.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueMember: uniqueIndex("workspace_members_workspace_user_uq").on(
      table.workspaceId,
      table.userId,
    ),
    // Enforce the single-owner invariant (Decision 8) at the DB level.
    oneOwner: uniqueIndex("one_owner_per_workspace")
      .on(table.workspaceId)
      .where(sql`${table.role} = 'owner'`),
  }),
);

export type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect;
export type WorkspaceMemberInsert = typeof workspaceMembers.$inferInsert;
```

```typescript
// packages/db/src/repos/workspace-members.ts
import type { MembershipStatus, WorkspaceRole } from "@folio/types";
import { and, asc, eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import {
  type WorkspaceMemberInsert,
  type WorkspaceMemberRow,
  workspaceMembers,
} from "../schema/workspace-members.js";

export const workspaceMembersRepo = {
  async create(input: WorkspaceMemberInsert, db: Db = getDb()): Promise<WorkspaceMemberRow> {
    const [row] = await db.insert(workspaceMembers).values(input).returning();
    if (!row) {
      throw new Error("workspaceMembersRepo.create: insert returned no row");
    }
    return row;
  },

  async getMembership(
    workspaceId: string,
    userId: string,
    db: Db = getDb(),
  ): Promise<WorkspaceMemberRow | null> {
    const [row] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1);
    return row ?? null;
  },

  async listByWorkspace(workspaceId: string, db: Db = getDb()): Promise<WorkspaceMemberRow[]> {
    return db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(asc(workspaceMembers.joinedAt));
  },

  async updateRole(
    id: string,
    role: WorkspaceRole,
    elevatedBy: string,
    db: Db = getDb(),
  ): Promise<WorkspaceMemberRow | null> {
    const [row] = await db
      .update(workspaceMembers)
      .set({ role, elevatedBy, updatedAt: new Date() })
      .where(eq(workspaceMembers.id, id))
      .returning();
    return row ?? null;
  },

  async updateStatus(
    id: string,
    status: MembershipStatus,
    suspendedBy: string | null,
    db: Db = getDb(),
  ): Promise<WorkspaceMemberRow | null> {
    const [row] = await db
      .update(workspaceMembers)
      .set({ status, suspendedBy, updatedAt: new Date() })
      .where(eq(workspaceMembers.id, id))
      .returning();
    return row ?? null;
  },
};
```

Add exports to `packages/db/src/schema/index.ts` and `packages/db/src/repos/index.ts` (`export * from "./workspace-members.js";`). Add `"workspace_members"` to the truncate list in `db.ts` before `"workspaces"`.

- [ ] **Step 4: Generate migration (GATE) and run test**

Run: `pnpm --filter @folio/db db:generate`
STOP: operator reviews the migration for the table + both indexes (verify the partial `WHERE role = 'owner'` index is present).
Run: `pnpm --filter @folio/db test workspace-members`
Expected: PASS (or SKIPPED without a DB).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/workspace-members.ts packages/db/src/repos/workspace-members.ts packages/db/src/schema/index.ts packages/db/src/repos/index.ts packages/db/test/helpers/db.ts packages/db/test/workspace-members.e2e.test.ts packages/db/drizzle
git commit -m "feat(db): add workspace_members with single-owner constraint"
```

---

## Task 4: `audit_logs` schema + repo

**Files:**
- Create: `packages/db/src/schema/audit-logs.ts`, `packages/db/src/repos/audit-logs.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/repos/index.ts`, `packages/db/test/helpers/db.ts` (add `audit_logs` first in truncate list)
- Test: `packages/db/test/audit-logs.e2e.test.ts`

**Interfaces:**
- Consumes: `AUDIT_ACTION` from `@folio/types`; `users`, `workspaces` tables.
- Produces: `auditLogs` table, `AuditLogRow`/`AuditLogInsert`, `auditLogsRepo.record(input)` and `auditLogsRepo.listByWorkspace(workspaceId)`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/test/audit-logs.e2e.test.ts
import { ACCOUNT_TYPE, AUDIT_ACTION } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { auditLogsRepo, usersRepo, workspacesRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

d("auditLogsRepo (e2e)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });
  afterAll(async () => {
    await closeDb();
  });

  it("records an action with before/after and lists it by workspace", async () => {
    const ws = await workspacesRepo.create(
      { githubAccountId: 5, accountLogin: "acme", accountType: ACCOUNT_TYPE.ORGANIZATION },
      db,
    );
    const actor = await usersRepo.create({ githubUserId: 1, login: "root", avatarUrl: "x" }, db);
    await auditLogsRepo.record(
      {
        actorUserId: actor.id,
        action: AUDIT_ACTION.ROLE_CHANGE,
        targetType: "workspace_member",
        targetId: actor.id,
        workspaceId: ws.id,
        before: { role: "reviewer" },
        after: { role: "admin" },
      },
      db,
    );
    const logs = await auditLogsRepo.listByWorkspace(ws.id, db);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe(AUDIT_ACTION.ROLE_CHANGE);
    expect(logs[0]?.after).toEqual({ role: "admin" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/db test audit-logs`
Expected: FAIL — `auditLogsRepo` not exported.

- [ ] **Step 3: Write the schema and repo**

```typescript
// packages/db/src/schema/audit-logs.ts
import { AUDIT_ACTION } from "@folio/types";
import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";
import { users } from "./users.js";
import { workspaces } from "./workspaces.js";

// Persistent audit trail for authorization state changes (Decision 14).
export const auditLogs = pgTable("audit_logs", {
  ...baseColumns(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action", {
    enum: [
      AUDIT_ACTION.USER_APPROVE,
      AUDIT_ACTION.USER_SUSPEND,
      AUDIT_ACTION.MEMBER_SUSPEND,
      AUDIT_ACTION.MEMBER_RESTORE,
      AUDIT_ACTION.ROLE_CHANGE,
      AUDIT_ACTION.OWNER_TRANSFER,
      AUDIT_ACTION.REPO_ACTIVATION_CHANGE,
    ],
  }).notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  // Null for global (non-workspace) actions like user approve/suspend.
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  before: jsonb("before"),
  after: jsonb("after"),
});

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type AuditLogInsert = typeof auditLogs.$inferInsert;
```

```typescript
// packages/db/src/repos/audit-logs.ts
import { desc, eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type AuditLogInsert, type AuditLogRow, auditLogs } from "../schema/audit-logs.js";

export const auditLogsRepo = {
  async record(input: AuditLogInsert, db: Db = getDb()): Promise<AuditLogRow> {
    const [row] = await db.insert(auditLogs).values(input).returning();
    if (!row) {
      throw new Error("auditLogsRepo.record: insert returned no row");
    }
    return row;
  },

  async listByWorkspace(workspaceId: string, db: Db = getDb()): Promise<AuditLogRow[]> {
    return db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, workspaceId))
      .orderBy(desc(auditLogs.createdAt));
  },
};
```

Add exports to both index files. Add `"audit_logs"` as the FIRST entry in the truncate list in `db.ts` (it references users + workspaces).

- [ ] **Step 4: Generate migration (GATE) and run test**

Run: `pnpm --filter @folio/db db:generate`
STOP: operator reviews the migration.
Run: `pnpm --filter @folio/db test audit-logs`
Expected: PASS (or SKIPPED without a DB).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/audit-logs.ts packages/db/src/repos/audit-logs.ts packages/db/src/schema/index.ts packages/db/src/repos/index.ts packages/db/test/helpers/db.ts packages/db/test/audit-logs.e2e.test.ts packages/db/drizzle
git commit -m "feat(db): add audit_logs table for authorization changes"
```

---

## Task 5: Extend `users` with global status + system admin

**Files:**
- Modify: `packages/db/src/schema/users.ts`, `packages/db/src/repos/users.ts`
- Test: `packages/db/test/users-global-status.e2e.test.ts`

**Interfaces:**
- Consumes: `GLOBAL_STATUS` from `@folio/types`.
- Produces: `users.globalStatus` (`pending`/`active`/`suspended`, default `pending`) and `users.isSystemAdmin` (boolean, default false) columns with a **partial unique index** `one_system_admin` on `is_system_admin WHERE is_system_admin = true`; `usersRepo` gains `setGlobalStatus(id, status)`, `getSystemAdmin()`, `setSystemAdmin(id, value)`, `listAll()`. Existing `USER_STATUS`/`status` column and `approve`/`listPending` stay for the migration window; Task 16 removes their last usage.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/test/users-global-status.e2e.test.ts
import { GLOBAL_STATUS } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { usersRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

d("usersRepo global status + system admin (e2e)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });
  afterAll(async () => {
    await closeDb();
  });

  it("defaults new users to pending global status", async () => {
    const u = await usersRepo.create({ githubUserId: 1, login: "a", avatarUrl: "x" }, db);
    expect(u.globalStatus).toBe(GLOBAL_STATUS.PENDING);
    expect(u.isSystemAdmin).toBe(false);
  });

  it("promotes exactly one system admin", async () => {
    const u = await usersRepo.create({ githubUserId: 2, login: "b", avatarUrl: "x" }, db);
    await usersRepo.setSystemAdmin(u.id, true, db);
    expect((await usersRepo.getSystemAdmin(db))?.id).toBe(u.id);

    const other = await usersRepo.create({ githubUserId: 3, login: "c", avatarUrl: "x" }, db);
    await expect(usersRepo.setSystemAdmin(other.id, true, db)).rejects.toThrow();
  });

  it("moves a user through global status transitions", async () => {
    const u = await usersRepo.create({ githubUserId: 4, login: "d", avatarUrl: "x" }, db);
    const active = await usersRepo.setGlobalStatus(u.id, GLOBAL_STATUS.ACTIVE, db);
    expect(active?.globalStatus).toBe(GLOBAL_STATUS.ACTIVE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/db test users-global-status`
Expected: FAIL — `globalStatus`/`setSystemAdmin` do not exist.

- [ ] **Step 3: Extend the schema**

Replace `packages/db/src/schema/users.ts` with:

```typescript
import { GLOBAL_STATUS } from "@folio/types";
import { sql } from "drizzle-orm";
import { bigint, boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns.js";

// Legacy pre-RBAC status. Kept only during the migration window; superseded by
// globalStatus. See the Task 7 backfill (approved → active).
export const USER_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
} as const;
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const users = pgTable(
  "users",
  {
    ...baseColumns(),
    githubUserId: bigint("github_user_id", { mode: "number" }).notNull().unique(),
    login: text("login").notNull(),
    avatarUrl: text("avatar_url").notNull(),
    email: text("email"),
    status: text("status").$type<UserStatus>().notNull().default(USER_STATUS.PENDING),
    globalStatus: text("global_status", {
      enum: [GLOBAL_STATUS.PENDING, GLOBAL_STATUS.ACTIVE, GLOBAL_STATUS.SUSPENDED],
    })
      .notNull()
      .default(GLOBAL_STATUS.PENDING),
    isSystemAdmin: boolean("is_system_admin").notNull().default(false),
  },
  (table) => ({
    // Exactly one global system_admin (Decision 18); replaced only via transfer.
    oneSystemAdmin: uniqueIndex("one_system_admin")
      .on(table.isSystemAdmin)
      .where(sql`${table.isSystemAdmin} = true`),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
```

- [ ] **Step 4: Extend the repo**

Add these methods to the `usersRepo` object in `packages/db/src/repos/users.ts` (keep existing methods; add `GlobalStatus` import from `@folio/types` and `eq` already imported):

```typescript
  async listAll(db: Db = getDb()): Promise<UserRow[]> {
    return db.select().from(users).orderBy(asc(users.createdAt));
  },

  async setGlobalStatus(
    id: string,
    globalStatus: GlobalStatus,
    db: Db = getDb(),
  ): Promise<UserRow | null> {
    const [row] = await db
      .update(users)
      .set({ globalStatus, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return row ?? null;
  },

  async getSystemAdmin(db: Db = getDb()): Promise<UserRow | null> {
    const [row] = await db.select().from(users).where(eq(users.isSystemAdmin, true)).limit(1);
    return row ?? null;
  },

  async setSystemAdmin(id: string, value: boolean, db: Db = getDb()): Promise<UserRow | null> {
    const [row] = await db
      .update(users)
      .set({ isSystemAdmin: value, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return row ?? null;
  },
```

Update the import line at the top of `users.ts` to include the type:
```typescript
import type { GlobalStatus } from "@folio/types";
```

- [ ] **Step 5: Generate migration (GATE), run test, commit**

Run: `pnpm --filter @folio/db db:generate`
STOP: operator reviews the migration (new columns default-backfill existing rows to `pending`/false; Task 7 corrects `approved`→`active`).
Run: `pnpm --filter @folio/db test users-global-status`
Expected: PASS (or SKIPPED without a DB).

```bash
git add packages/db/src/schema/users.ts packages/db/src/repos/users.ts packages/db/test/users-global-status.e2e.test.ts packages/db/drizzle
git commit -m "feat(db): add global_status and single system_admin to users"
```

---

## Task 6: Link installations + repositories to workspaces

**Files:**
- Modify: `packages/db/src/schema/installations.ts`, `packages/db/src/schema/repositories.ts`, `packages/db/src/repos/installations.ts`
- Test: `packages/db/test/installation-workspace-link.e2e.test.ts`

**Interfaces:**
- Produces: `installations.githubAccountId` (bigint, **nullable** until Task 7 backfill), `repositories.workspaceId` (uuid FK → workspaces, **nullable** until backfill); `installationsRepo.setGithubAccountId(id, githubAccountId)` and `installationsRepo.listByWorkspaceAccountId(githubAccountId)`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/test/installation-workspace-link.e2e.test.ts
import { ACCOUNT_TYPE } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { installationsRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

d("installations workspace link (e2e)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });
  afterAll(async () => {
    await closeDb();
  });

  it("stores and queries installations by github account id", async () => {
    const inst = await installationsRepo.create(
      { githubInstallationId: 99, accountLogin: "acme", accountType: ACCOUNT_TYPE.ORGANIZATION },
      db,
    );
    await installationsRepo.setGithubAccountId(inst.id, 4242, db);
    const found = await installationsRepo.listByWorkspaceAccountId(4242, db);
    expect(found.map((i) => i.id)).toContain(inst.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/db test installation-workspace-link`
Expected: FAIL — `setGithubAccountId` not defined.

- [ ] **Step 3: Extend the schemas**

In `packages/db/src/schema/installations.ts`, add inside the `pgTable` column object (after `accountType`):

```typescript
  // Stable numeric account id linking this install to its workspace (Decision 11).
  // Nullable until the Task 7 backfill, then tightened to NOT NULL.
  githubAccountId: bigint("github_account_id", { mode: "number" }),
```

In `packages/db/src/schema/repositories.ts`, add the import and column:

```typescript
import { workspaces } from "./workspaces.js";
```
```typescript
  // Nullable until the Task 7 backfill links every repo to its workspace.
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
```

- [ ] **Step 4: Extend the installations repo**

Add to the `installationsRepo` object in `packages/db/src/repos/installations.ts` (uses `eq` already imported):

```typescript
  async setGithubAccountId(
    id: string,
    githubAccountId: number,
    db: Db = getDb(),
  ): Promise<InstallationRow | null> {
    const [row] = await db
      .update(installations)
      .set({ githubAccountId, updatedAt: new Date() })
      .where(eq(installations.id, id))
      .returning();
    return row ?? null;
  },

  async listByWorkspaceAccountId(
    githubAccountId: number,
    db: Db = getDb(),
  ): Promise<InstallationRow[]> {
    return db
      .select()
      .from(installations)
      .where(eq(installations.githubAccountId, githubAccountId));
  },
```

- [ ] **Step 5: Generate migration (GATE), run test, commit**

Run: `pnpm --filter @folio/db db:generate`
STOP: operator reviews the migration (both new columns are nullable — no constraint break).
Run: `pnpm --filter @folio/db test installation-workspace-link`
Expected: PASS (or SKIPPED without a DB).

```bash
git add packages/db/src/schema/installations.ts packages/db/src/schema/repositories.ts packages/db/src/repos/installations.ts packages/db/test/installation-workspace-link.e2e.test.ts packages/db/drizzle
git commit -m "feat(db): link installations and repositories to workspaces"
```

---

## Task 7: Backfill data migration + constraint tightening (GATE)

**Files:**
- Create: `packages/db/src/migrate/backfill-workspaces.ts`
- Create: `packages/db/drizzle/<generated>_tighten_rbac_constraints.sql` (hand-authored SQL migration for NOT NULL)
- Test: `packages/db/test/backfill-workspaces.e2e.test.ts`

**Interfaces:**
- Consumes: `workspacesRepo`, `installationsRepo`, `repositoriesRepo`, `usersRepo`, raw `db`.
- Produces: `backfillWorkspaces(db)` — for each installation, upserts a workspace from its `githubAccountId` (looked up via GitHub if missing — see note), links installation + its repositories to the workspace, and maps `users.status='approved'` → `globalStatus='active'`.

> Note on missing account ids: existing `installations` rows predate `githubAccountId`. The backfill reads the numeric account id from the GitHub App installation API when null. This task assumes an injected `resolveAccountId(installationId): Promise<number>` function so the migration is testable without live GitHub; wiring it to the real GitHub client happens in Task 17's claim flow. For the backfill test, a stub is passed.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/test/backfill-workspaces.e2e.test.ts
import { ACCOUNT_TYPE, GLOBAL_STATUS, USER_STATUS } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { backfillWorkspaces } from "../src/migrate/backfill-workspaces.js";
import {
  installationsRepo,
  repositoriesRepo,
  usersRepo,
  workspacesRepo,
} from "../src/repos/index.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

d("backfillWorkspaces (e2e)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });
  afterAll(async () => {
    await closeDb();
  });

  it("creates workspaces, links repos, and maps approved users to active", async () => {
    const inst = await installationsRepo.create(
      { githubInstallationId: 11, accountLogin: "acme", accountType: ACCOUNT_TYPE.ORGANIZATION },
      db,
    );
    const repo = await repositoriesRepo.create(
      {
        installationId: inst.id,
        githubRepoId: 22,
        owner: "acme",
        name: "widget",
        fullName: "acme/widget",
        private: false,
        defaultBranch: "main",
      },
      db,
    );
    const legacy = await usersRepo.create({ githubUserId: 1, login: "old", avatarUrl: "x" }, db);
    await usersRepo.approve(legacy.id, db); // sets status='approved'

    await backfillWorkspaces(db, { resolveAccountId: async () => 4242 });

    const ws = await workspacesRepo.getByGithubAccountId(4242, db);
    expect(ws).not.toBeNull();
    const repos = await repositoriesRepo.listByInstallationIds([inst.id], db);
    expect(repos[0]?.workspaceId).toBe(ws?.id);
    const migrated = await usersRepo.getById(legacy.id, db);
    expect(migrated?.globalStatus).toBe(GLOBAL_STATUS.ACTIVE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/db test backfill-workspaces`
Expected: FAIL — `backfill-workspaces.js` module not found.

- [ ] **Step 3: Write the backfill**

```typescript
// packages/db/src/migrate/backfill-workspaces.ts
import { ACCOUNT_TYPE, GLOBAL_STATUS, USER_STATUS } from "@folio/types";
import { eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { installations } from "../schema/installations.js";
import { repositories } from "../schema/repositories.js";
import { users } from "../schema/users.js";
import { workspacesRepo } from "../repos/workspaces.js";

export interface BackfillDeps {
  // Resolves an installation's stable numeric account id (from the GitHub App API in prod).
  resolveAccountId: (installationId: string) => Promise<number>;
}

/**
 * One-time data migration: derive a workspace per installation account, link
 * installations + repositories, and map the legacy approved status to active.
 * Idempotent — safe to re-run.
 */
export async function backfillWorkspaces(db: Db = getDb(), deps?: BackfillDeps): Promise<void> {
  const resolveAccountId = deps?.resolveAccountId;
  const allInstalls = await db.select().from(installations);
  for (const inst of allInstalls) {
    const accountId =
      inst.githubAccountId ??
      (resolveAccountId ? await resolveAccountId(inst.id) : null);
    if (accountId === null) {
      throw new Error(`backfillWorkspaces: no account id for installation ${inst.id}`);
    }
    const ws = await workspacesRepo.upsertByGithubAccountId(
      {
        githubAccountId: accountId,
        accountLogin: inst.accountLogin,
        accountType:
          inst.accountType === ACCOUNT_TYPE.ORGANIZATION
            ? ACCOUNT_TYPE.ORGANIZATION
            : ACCOUNT_TYPE.USER,
      },
      db,
    );
    if (inst.githubAccountId === null) {
      await db
        .update(installations)
        .set({ githubAccountId: accountId, updatedAt: new Date() })
        .where(eq(installations.id, inst.id));
    }
    await db
      .update(repositories)
      .set({ workspaceId: ws.id, updatedAt: new Date() })
      .where(eq(repositories.installationId, inst.id));
  }
  // Map the legacy pre-RBAC approval state onto the new global lifecycle.
  await db
    .update(users)
    .set({ globalStatus: GLOBAL_STATUS.ACTIVE, updatedAt: new Date() })
    .where(eq(users.status, USER_STATUS.APPROVED));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @folio/db test backfill-workspaces`
Expected: PASS (or SKIPPED without a DB).

- [ ] **Step 5: Author the constraint-tightening migration (GATE)**

After the backfill has been reviewed and run against the target DB, hand-author a SQL migration under `packages/db/drizzle/` that sets `installations.github_account_id` and `repositories.workspace_id` to `NOT NULL`. Do NOT auto-generate this from schema until Steps in a follow-up flip the schema columns to `.notNull()`. This step is an explicit operator gate: it runs only after the backfill is confirmed on the target DB.

```sql
-- packages/db/drizzle/NNNN_tighten_rbac_constraints.sql
ALTER TABLE "installations" ALTER COLUMN "github_account_id" SET NOT NULL;
ALTER TABLE "repositories" ALTER COLUMN "workspace_id" SET NOT NULL;
```

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/migrate/backfill-workspaces.ts packages/db/test/backfill-workspaces.e2e.test.ts packages/db/drizzle
git commit -m "feat(db): backfill workspaces and tighten RBAC constraints"
```

---

## Task 8: `AuthorizationPolicy` pure decision functions

**Files:**
- Create: `apps/backend/src/domain/authorization/workspace-role.model.ts`
- Create: `apps/backend/src/domain/authorization/authorization-policy.ts`
- Test: `apps/backend/src/domain/authorization/authorization-policy.test.ts`

**Interfaces:**
- Consumes: `WorkspaceRole`, `MembershipStatus`, `GlobalStatus`, `WORKSPACE_ROLE`, `MEMBERSHIP_STATUS`, `GLOBAL_STATUS` from `@folio/types`.
- Produces (workspace-role.model.ts): `interface ActorGlobalContext { globalStatus: GlobalStatus; isSystemAdmin: boolean }`, `interface WorkspaceMembership { role: WorkspaceRole; status: MembershipStatus }`, `type PolicyDecision = { allow: true } | { allow: false; reason: string }`, `type MemberOperation = "suspend" | "restore" | "remove" | "elevate" | "demote"`, and `roleRank(role): number`.
- Produces (authorization-policy.ts): `canAccessWorkspace(actor, membership, requiredRole): PolicyDecision`, `canManageMember(actorMembership, targetMembership, operation): PolicyDecision`, `canTransferOwnership(actorMembership): PolicyDecision`. Consumed by the guards (Task 12) and facades (Task 16).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/domain/authorization/authorization-policy.test.ts
import { GLOBAL_STATUS, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { describe, expect, it } from "vitest";
import {
  canAccessWorkspace,
  canManageMember,
  canTransferOwnership,
} from "./authorization-policy.js";

const active = MEMBERSHIP_STATUS.ACTIVE;

describe("canAccessWorkspace", () => {
  it("allows an active admin to access an admin-gated action", () => {
    const d = canAccessWorkspace(
      { globalStatus: GLOBAL_STATUS.ACTIVE, isSystemAdmin: false },
      { role: WORKSPACE_ROLE.ADMIN, status: active },
      WORKSPACE_ROLE.ADMIN,
    );
    expect(d.allow).toBe(true);
  });

  it("denies a reviewer an admin-gated action", () => {
    const d = canAccessWorkspace(
      { globalStatus: GLOBAL_STATUS.ACTIVE, isSystemAdmin: false },
      { role: WORKSPACE_ROLE.REVIEWER, status: active },
      WORKSPACE_ROLE.ADMIN,
    );
    expect(d.allow).toBe(false);
  });

  it("denies a globally suspended user regardless of role", () => {
    const d = canAccessWorkspace(
      { globalStatus: GLOBAL_STATUS.SUSPENDED, isSystemAdmin: true },
      { role: WORKSPACE_ROLE.OWNER, status: active },
      WORKSPACE_ROLE.REVIEWER,
    );
    expect(d.allow).toBe(false);
  });

  it("denies a suspended membership (Decision 10)", () => {
    const d = canAccessWorkspace(
      { globalStatus: GLOBAL_STATUS.ACTIVE, isSystemAdmin: false },
      { role: WORKSPACE_ROLE.REVIEWER, status: MEMBERSHIP_STATUS.SUSPENDED },
      WORKSPACE_ROLE.REVIEWER,
    );
    expect(d.allow).toBe(false);
  });
});

describe("canManageMember", () => {
  const admin = { role: WORKSPACE_ROLE.ADMIN, status: active } as const;
  const owner = { role: WORKSPACE_ROLE.OWNER, status: active } as const;
  const reviewer = { role: WORKSPACE_ROLE.REVIEWER, status: active } as const;

  it("lets an admin suspend a reviewer", () => {
    expect(canManageMember(admin, reviewer, "suspend").allow).toBe(true);
  });

  it("forbids an admin acting on another admin (Decision 9)", () => {
    expect(canManageMember(admin, admin, "suspend").allow).toBe(false);
  });

  it("forbids an admin elevating a reviewer (owner-only)", () => {
    expect(canManageMember(admin, reviewer, "elevate").allow).toBe(false);
  });

  it("lets an owner elevate a reviewer", () => {
    expect(canManageMember(owner, reviewer, "elevate").allow).toBe(true);
  });
});

describe("canTransferOwnership", () => {
  it("allows only the owner", () => {
    expect(canTransferOwnership({ role: WORKSPACE_ROLE.OWNER, status: active }).allow).toBe(true);
    expect(canTransferOwnership({ role: WORKSPACE_ROLE.ADMIN, status: active }).allow).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/backend test authorization-policy`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the model and policy**

```typescript
// apps/backend/src/domain/authorization/workspace-role.model.ts
import { WORKSPACE_ROLE, type GlobalStatus, type MembershipStatus, type WorkspaceRole } from "@folio/types";

export interface ActorGlobalContext {
  globalStatus: GlobalStatus;
  isSystemAdmin: boolean;
}

export interface WorkspaceMembership {
  role: WorkspaceRole;
  status: MembershipStatus;
}

export type MemberOperation = "suspend" | "restore" | "remove" | "elevate" | "demote";

export type PolicyDecision = { allow: true } | { allow: false; reason: string };

const RANK: Record<WorkspaceRole, number> = {
  [WORKSPACE_ROLE.REVIEWER]: 1,
  [WORKSPACE_ROLE.ADMIN]: 2,
  [WORKSPACE_ROLE.OWNER]: 3,
};

export function roleRank(role: WorkspaceRole): number {
  return RANK[role];
}

export const allow: PolicyDecision = { allow: true };
export function deny(reason: string): PolicyDecision {
  return { allow: false, reason };
}
```

```typescript
// apps/backend/src/domain/authorization/authorization-policy.ts
import { GLOBAL_STATUS, MEMBERSHIP_STATUS, WORKSPACE_ROLE, type WorkspaceRole } from "@folio/types";
import {
  type ActorGlobalContext,
  type MemberOperation,
  type PolicyDecision,
  type WorkspaceMembership,
  allow,
  deny,
  roleRank,
} from "./workspace-role.model.js";

// Folio role axis. system_admin is intentionally NOT consulted here: it never
// grants workspace management or repo-data access (Decision 5).
export function canAccessWorkspace(
  actor: ActorGlobalContext,
  membership: WorkspaceMembership,
  requiredRole: WorkspaceRole,
): PolicyDecision {
  if (actor.globalStatus !== GLOBAL_STATUS.ACTIVE) {
    return deny("global status is not active");
  }
  if (membership.status !== MEMBERSHIP_STATUS.ACTIVE) {
    return deny("workspace membership is suspended");
  }
  if (roleRank(membership.role) < roleRank(requiredRole)) {
    return deny(`requires ${requiredRole}`);
  }
  return allow;
}

const OWNER_ONLY: ReadonlySet<MemberOperation> = new Set(["elevate", "demote"]);

// Decision 9: admin may suspend/restore/remove reviewers only; role changes are owner-only.
export function canManageMember(
  actorMembership: WorkspaceMembership,
  targetMembership: WorkspaceMembership,
  operation: MemberOperation,
): PolicyDecision {
  if (actorMembership.status !== MEMBERSHIP_STATUS.ACTIVE) {
    return deny("actor membership is suspended");
  }
  if (OWNER_ONLY.has(operation)) {
    return actorMembership.role === WORKSPACE_ROLE.OWNER
      ? allow
      : deny("only the owner may change roles");
  }
  // suspend / restore / remove
  if (
    actorMembership.role !== WORKSPACE_ROLE.OWNER &&
    actorMembership.role !== WORKSPACE_ROLE.ADMIN
  ) {
    return deny("only owner or admin may manage members");
  }
  if (
    actorMembership.role === WORKSPACE_ROLE.ADMIN &&
    targetMembership.role !== WORKSPACE_ROLE.REVIEWER
  ) {
    return deny("admins may only manage reviewers");
  }
  return allow;
}

export function canTransferOwnership(actorMembership: WorkspaceMembership): PolicyDecision {
  return actorMembership.role === WORKSPACE_ROLE.OWNER && actorMembership.status === MEMBERSHIP_STATUS.ACTIVE
    ? allow
    : deny("only the owner may transfer ownership");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @folio/backend test authorization-policy`
Expected: PASS (10 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/domain/authorization/
git commit -m "feat(backend): add pure authorization policy for workspace roles"
```

---

## Task 9: `EntitlementService` + `AlwaysEntitledService`

**Files:**
- Create: `apps/backend/src/domain/authorization/entitlement.service.ts`
- Test: `apps/backend/src/domain/authorization/entitlement.service.test.ts`

**Interfaces:**
- Consumes: `EntitlementFeature`, `GlobalStatus`, `GLOBAL_STATUS` from `@folio/types`.
- Produces: `type EntitlementDecision = { entitled: true } | { entitled: false; reason: string }`; abstract class `EntitlementService { abstract canUseFeature(input: { userId: string; globalStatus: GlobalStatus; feature: EntitlementFeature }): Promise<EntitlementDecision> }`; concrete `AlwaysEntitledService` returning `entitled` for active users. Consumed by `EntitlementGuard` (Task 14). Swapping in a real subscription check later only replaces this class.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/domain/authorization/entitlement.service.test.ts
import { ENTITLEMENT_FEATURE, GLOBAL_STATUS } from "@folio/types";
import { describe, expect, it } from "vitest";
import { AlwaysEntitledService } from "./entitlement.service.js";

describe("AlwaysEntitledService", () => {
  const svc = new AlwaysEntitledService();

  it("entitles an active user to every gated feature", async () => {
    const d = await svc.canUseFeature({
      userId: "u1",
      globalStatus: GLOBAL_STATUS.ACTIVE,
      feature: ENTITLEMENT_FEATURE.PR_ANALYSIS,
    });
    expect(d.entitled).toBe(true);
  });

  it("does not entitle a non-active user", async () => {
    const d = await svc.canUseFeature({
      userId: "u1",
      globalStatus: GLOBAL_STATUS.SUSPENDED,
      feature: ENTITLEMENT_FEATURE.PR_ANALYSIS,
    });
    expect(d.entitled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/backend test entitlement.service`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/backend/src/domain/authorization/entitlement.service.ts
import { GLOBAL_STATUS, type EntitlementFeature, type GlobalStatus } from "@folio/types";
import { Injectable } from "@nestjs/common";

export type EntitlementDecision = { entitled: true } | { entitled: false; reason: string };

export interface EntitlementQuery {
  userId: string;
  globalStatus: GlobalStatus;
  feature: EntitlementFeature;
}

// Seam for a future USER-scoped subscription check (Decision 3/4). Swap the
// concrete implementation to enforce real entitlements; call sites stay put.
export abstract class EntitlementService {
  abstract canUseFeature(input: EntitlementQuery): Promise<EntitlementDecision>;
}

@Injectable()
export class AlwaysEntitledService extends EntitlementService {
  async canUseFeature(input: EntitlementQuery): Promise<EntitlementDecision> {
    if (input.globalStatus !== GLOBAL_STATUS.ACTIVE) {
      return { entitled: false, reason: "global status is not active" };
    }
    return { entitled: true };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @folio/backend test entitlement.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/domain/authorization/entitlement.service.ts apps/backend/src/domain/authorization/entitlement.service.test.ts
git commit -m "feat(backend): add subscription-ready entitlement service seam"
```

---

## Task 10: `WorkspaceResolver` + `WorkspaceMembershipService`

**Files:**
- Create: `apps/backend/src/infrastructure/authorization/workspace-resolver.ts`
- Create: `apps/backend/src/infrastructure/authorization/workspace-membership.service.ts`
- Test: `apps/backend/src/infrastructure/authorization/workspace-membership.service.test.ts`

**Interfaces:**
- Consumes: `workspacesRepo`, `installationsRepo`, `workspaceMembersRepo`, `auditLogsRepo`, `usersRepo` from `@folio/db`; `WORKSPACE_ROLE`, `MEMBERSHIP_STATUS`, `AUDIT_ACTION`.
- Produces:
  - `WorkspaceResolver.resolveByGithubAccountId(githubAccountId): Promise<WorkspaceRow | null>` and `.resolveForRepo(owner, githubRepoId): Promise<WorkspaceRow | null>`.
  - `WorkspaceMembershipService` with `getMembership(workspaceId, userId)`, `ensureReviewer(workspaceId, userId)` (auto-join per Decision 6/10 — returns existing membership, creates a `reviewer/active` when none, and returns the row unchanged when it is `suspended` WITHOUT recreating), `suspendReviewer/restoreReviewer/removeReviewer/changeRole/transferOwnership` — each writes an `audit_logs` row. Auto-join (`ensureReviewer`) is NOT audited (Decision 14).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/infrastructure/authorization/workspace-membership.service.test.ts
import { AUDIT_ACTION, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { auditLogsRepo, workspaceMembersRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMembershipService } from "./workspace-membership.service.js";

vi.mock("@folio/db", () => ({
  workspaceMembersRepo: {
    getMembership: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    updateRole: vi.fn(),
  },
  auditLogsRepo: { record: vi.fn() },
}));

const svc = new WorkspaceMembershipService();

beforeEach(() => vi.clearAllMocks());

describe("ensureReviewer (auto-join, Decision 6/10)", () => {
  it("creates a reviewer membership when none exists and does not audit it", async () => {
    vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(null);
    vi.mocked(workspaceMembersRepo.create).mockResolvedValue({
      id: "m1",
      role: WORKSPACE_ROLE.REVIEWER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    } as never);

    const m = await svc.ensureReviewer("ws1", "u1");

    expect(workspaceMembersRepo.create).toHaveBeenCalled();
    expect(auditLogsRepo.record).not.toHaveBeenCalled();
    expect(m.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
  });

  it("does NOT recreate a suspended membership", async () => {
    vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue({
      id: "m2",
      role: WORKSPACE_ROLE.REVIEWER,
      status: MEMBERSHIP_STATUS.SUSPENDED,
    } as never);

    const m = await svc.ensureReviewer("ws1", "u1");

    expect(workspaceMembersRepo.create).not.toHaveBeenCalled();
    expect(m.status).toBe(MEMBERSHIP_STATUS.SUSPENDED);
  });
});

describe("suspendReviewer", () => {
  it("suspends and writes an audit row", async () => {
    vi.mocked(workspaceMembersRepo.updateStatus).mockResolvedValue({
      id: "m1",
      workspaceId: "ws1",
      role: WORKSPACE_ROLE.REVIEWER,
      status: MEMBERSHIP_STATUS.SUSPENDED,
    } as never);

    await svc.suspendReviewer({
      workspaceId: "ws1",
      membershipId: "m1",
      actorUserId: "admin1",
      targetUserId: "u1",
    });

    expect(workspaceMembersRepo.updateStatus).toHaveBeenCalledWith(
      "m1",
      MEMBERSHIP_STATUS.SUSPENDED,
      "admin1",
    );
    expect(auditLogsRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTION.MEMBER_SUSPEND, workspaceId: "ws1" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/backend test workspace-membership.service`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the resolver**

```typescript
// apps/backend/src/infrastructure/authorization/workspace-resolver.ts
import { type WorkspaceRow, installationsRepo, repositoriesRepo, workspacesRepo } from "@folio/db";
import { Injectable } from "@nestjs/common";

// Resolves the stable workspace for a request, replacing the old
// `accountLogin == currentUser.login` inference so shared orgs are modeled.
@Injectable()
export class WorkspaceResolver {
  async resolveByGithubAccountId(githubAccountId: number): Promise<WorkspaceRow | null> {
    return workspacesRepo.getByGithubAccountId(githubAccountId);
  }

  async resolveById(workspaceId: string): Promise<WorkspaceRow | null> {
    return workspacesRepo.getById(workspaceId);
  }

  // Resolve the workspace that owns a given GitHub repo (by numeric repo id).
  async resolveForRepoId(githubRepoId: number): Promise<WorkspaceRow | null> {
    const repo = await repositoriesRepo.getByGithubRepoId(githubRepoId);
    if (!repo?.workspaceId) {
      return null;
    }
    return workspacesRepo.getById(repo.workspaceId);
  }

  async listInstallationsForWorkspace(githubAccountId: number) {
    return installationsRepo.listByWorkspaceAccountId(githubAccountId);
  }
}
```

> If `repositoriesRepo.getByGithubRepoId` does not exist, add it in this task following the `getById` pattern in `packages/db/src/repos/repositories.ts` (select where `eq(repositories.githubRepoId, id)`), with its own e2e assertion appended to `packages/db/test/repos.e2e.test.ts`.

```typescript
// apps/backend/src/infrastructure/authorization/workspace-membership.service.ts
import {
  type WorkspaceMemberRow,
  auditLogsRepo,
  workspaceMembersRepo,
} from "@folio/db";
import { AUDIT_ACTION, MEMBERSHIP_STATUS, WORKSPACE_ROLE, type WorkspaceRole } from "@folio/types";
import { Injectable } from "@nestjs/common";

export interface MemberActionInput {
  workspaceId: string;
  membershipId: string;
  actorUserId: string;
  targetUserId: string;
}

@Injectable()
export class WorkspaceMembershipService {
  getMembership(workspaceId: string, userId: string): Promise<WorkspaceMemberRow | null> {
    return workspaceMembersRepo.getMembership(workspaceId, userId);
  }

  // Auto-join (Decision 6): create reviewer/active only when no record exists.
  // A suspended record is returned as-is and never recreated (Decision 10).
  async ensureReviewer(workspaceId: string, userId: string): Promise<WorkspaceMemberRow> {
    const existing = await workspaceMembersRepo.getMembership(workspaceId, userId);
    if (existing) {
      return existing;
    }
    return workspaceMembersRepo.create({
      workspaceId,
      userId,
      role: WORKSPACE_ROLE.REVIEWER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    });
  }

  async suspendReviewer(input: MemberActionInput): Promise<WorkspaceMemberRow | null> {
    const row = await workspaceMembersRepo.updateStatus(
      input.membershipId,
      MEMBERSHIP_STATUS.SUSPENDED,
      input.actorUserId,
    );
    await auditLogsRepo.record({
      actorUserId: input.actorUserId,
      action: AUDIT_ACTION.MEMBER_SUSPEND,
      targetType: "workspace_member",
      targetId: input.targetUserId,
      workspaceId: input.workspaceId,
      before: { status: MEMBERSHIP_STATUS.ACTIVE },
      after: { status: MEMBERSHIP_STATUS.SUSPENDED },
    });
    return row;
  }

  async restoreReviewer(input: MemberActionInput): Promise<WorkspaceMemberRow | null> {
    const row = await workspaceMembersRepo.updateStatus(
      input.membershipId,
      MEMBERSHIP_STATUS.ACTIVE,
      null,
    );
    await auditLogsRepo.record({
      actorUserId: input.actorUserId,
      action: AUDIT_ACTION.MEMBER_RESTORE,
      targetType: "workspace_member",
      targetId: input.targetUserId,
      workspaceId: input.workspaceId,
      before: { status: MEMBERSHIP_STATUS.SUSPENDED },
      after: { status: MEMBERSHIP_STATUS.ACTIVE },
    });
    return row;
  }

  // "Remove" persists as suspended so GitHub access can't auto-recreate it (Decision 10).
  async removeReviewer(input: MemberActionInput): Promise<WorkspaceMemberRow | null> {
    return this.suspendReviewer(input);
  }

  async changeRole(
    input: MemberActionInput & { fromRole: WorkspaceRole; toRole: WorkspaceRole },
  ): Promise<WorkspaceMemberRow | null> {
    const row = await workspaceMembersRepo.updateRole(
      input.membershipId,
      input.toRole,
      input.actorUserId,
    );
    await auditLogsRepo.record({
      actorUserId: input.actorUserId,
      action: AUDIT_ACTION.ROLE_CHANGE,
      targetType: "workspace_member",
      targetId: input.targetUserId,
      workspaceId: input.workspaceId,
      before: { role: input.fromRole },
      after: { role: input.toRole },
    });
    return row;
  }
}
```

> Owner transfer needs a single transaction over two role updates (Decision 8). Implement `transferOwnership` in Task 16's facade using the db client's transaction API (`db.transaction`) so both `updateRole` calls and the audit write commit atomically; the partial unique index guarantees the invariant if anything races.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @folio/backend test workspace-membership.service`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/authorization/ packages/db/src/repos/repositories.ts packages/db/test/repos.e2e.test.ts
git commit -m "feat(backend): add workspace resolver and membership service"
```

---

## Task 11: Action-specific GitHub permission level

**Files:**
- Modify: `packages/github/src/repo-permission.ts`
- Modify: `apps/backend/src/domain/auth/repo-access.service.ts`
- Modify: `apps/backend/src/infrastructure/github/github-oauth.adapter.ts` (expose level; see note)
- Test: `packages/github/test/repo-permission.test.ts`, `apps/backend/src/domain/auth/repo-access.service.test.ts`

**Interfaces:**
- Produces: `type GitHubRepoAccessLevel = "none" | "read" | "write" | "admin"`; `getUserRepoPermissionLevel(client, input): Promise<GitHubRepoAccessLevel>` (replaces the boolean `checkUserRepoPermission`, which is kept as a thin wrapper `level !== "none"` for existing callers); `RepoAccessService.getAccessLevel(input): Promise<GitHubRepoAccessLevel>` and `assertLevelAtLeast(input, required): Promise<boolean>`. The existing `assertAccessAllowed` stays (delegates to `assertLevelAtLeast(..., "read")`).

**Note on the dev bypass:** the current dev shortcut returns `true` for everything. Preserve local UX by returning `"admin"` in dev from `getAccessLevel` (so every action passes locally), but keep it isolated to one branch with a why-comment.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/github/test/repo-permission.test.ts
import { describe, expect, it } from "vitest";
import { getUserRepoPermissionLevel } from "../src/repo-permission.js";

function clientReturning(permission: string) {
  return {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async () => ({ data: { permission } }),
      },
    },
  } as never;
}

describe("getUserRepoPermissionLevel", () => {
  it("maps GitHub permission strings to levels", async () => {
    expect(await getUserRepoPermissionLevel(clientReturning("admin"), i())).toBe("admin");
    expect(await getUserRepoPermissionLevel(clientReturning("write"), i())).toBe("write");
    expect(await getUserRepoPermissionLevel(clientReturning("read"), i())).toBe("read");
    expect(await getUserRepoPermissionLevel(clientReturning("none"), i())).toBe("none");
  });

  it("treats a 404 collaborator lookup as none", async () => {
    const client = {
      rest: {
        repos: {
          getCollaboratorPermissionLevel: async () => {
            throw { status: 404 };
          },
        },
      },
    } as never;
    expect(await getUserRepoPermissionLevel(client, i())).toBe("none");
  });
});

function i() {
  return { owner: "acme", repo: "widget", username: "octo" };
}
```

```typescript
// apps/backend/src/domain/auth/repo-access.service.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepoAccessService } from "./repo-access.service.js";

const github = { getUserRepoPermissionLevel: vi.fn() };

describe("RepoAccessService.assertLevelAtLeast", () => {
  let svc: RepoAccessService;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new RepoAccessService(github as never);
  });

  it("allows when the live level meets the requirement", async () => {
    github.getUserRepoPermissionLevel.mockResolvedValue("write");
    expect(
      await svc.assertLevelAtLeast({ owner: "a", repo: "r", username: "u" }, "read"),
    ).toBe(true);
  });

  it("denies when the live level is below the requirement", async () => {
    github.getUserRepoPermissionLevel.mockResolvedValue("read");
    expect(
      await svc.assertLevelAtLeast({ owner: "a", repo: "r", username: "u" }, "admin"),
    ).toBe(false);
  });
});
```

> The backend test constructs `RepoAccessService` with a stub adapter exposing `getUserRepoPermissionLevel`. Set `APP_PROFILE=prd` in the test env (or inject via config mock) so the dev bypass does not short-circuit; mirror how `config.test.ts` sets profile.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @folio/github test repo-permission` and `pnpm --filter @folio/backend test repo-access.service`
Expected: FAIL — `getUserRepoPermissionLevel` / `assertLevelAtLeast` not defined.

- [ ] **Step 3: Rewrite `repo-permission.ts`**

```typescript
// packages/github/src/repo-permission.ts
import type { Octokit } from "octokit";

export type GitHubRepoAccessLevel = "none" | "read" | "write" | "admin";

const LEVELS: Record<string, GitHubRepoAccessLevel> = {
  admin: "admin",
  maintain: "admin",
  write: "write",
  triage: "read",
  read: "read",
  none: "none",
};

/**
 * Effective permission level of `username` on `owner/repo` via an installation
 * token (Model B). 404 → not a collaborator → "none". Callers gate action-specific
 * minimums (read=view, write=comment/analysis, admin=activation) themselves.
 */
export async function getUserRepoPermissionLevel(
  client: Octokit,
  input: { owner: string; repo: string; username: string },
): Promise<GitHubRepoAccessLevel> {
  try {
    const res = await client.rest.repos.getCollaboratorPermissionLevel({
      owner: input.owner,
      repo: input.repo,
      username: input.username,
    });
    return LEVELS[res.data.permission] ?? "none";
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { status?: number }).status === 404
    ) {
      return "none";
    }
    throw error;
  }
}

/** Back-compat boolean wrapper for existing "any access" callers. */
export async function checkUserRepoPermission(
  client: Octokit,
  input: { owner: string; repo: string; username: string },
): Promise<boolean> {
  return (await getUserRepoPermissionLevel(client, input)) !== "none";
}
```

Export `getUserRepoPermissionLevel` and `GitHubRepoAccessLevel` from `packages/github/src/index.ts` alongside the existing `checkUserRepoPermission` export.

- [ ] **Step 4: Extend `RepoAccessService`**

Add a `getUserRepoPermissionLevel` method to `GitHubOAuthAdapter` (mirrors its existing `userCanAccessRepo`, calling the new package function), then rewrite `repo-access.service.ts`:

```typescript
// apps/backend/src/domain/auth/repo-access.service.ts
import type { GitHubRepoAccessLevel } from "@folio/github";
import { Inject, Injectable } from "@nestjs/common";
import { config } from "../../config.js";
import { GitHubOAuthAdapter } from "../../infrastructure/github/github-oauth.adapter.js";

const CACHE_TTL_MS = 60_000;
const RANK: Record<GitHubRepoAccessLevel, number> = { none: 0, read: 1, write: 2, admin: 3 };

@Injectable()
export class RepoAccessService {
  private readonly levelCache = new Map<string, { level: GitHubRepoAccessLevel; until: number }>();

  constructor(@Inject(GitHubOAuthAdapter) private readonly github: GitHubOAuthAdapter) {}

  async getAccessLevel(input: {
    owner: string;
    repo: string;
    username: string;
  }): Promise<GitHubRepoAccessLevel> {
    if (config.APP_PROFILE === "dev") {
      // Dev uses a local fixture identity; grant admin so local review UX isn't blocked.
      return "admin";
    }
    const key = `${input.username}:${input.owner}/${input.repo}`;
    const cached = this.levelCache.get(key);
    if (cached && cached.until > Date.now()) {
      return cached.level;
    }
    const level = await this.github.getUserRepoPermissionLevel(
      input.owner,
      input.repo,
      input.username,
    );
    if (level !== "none") {
      this.levelCache.set(key, { level, until: Date.now() + CACHE_TTL_MS });
    }
    return level;
  }

  async assertLevelAtLeast(
    input: { owner: string; repo: string; username: string },
    required: GitHubRepoAccessLevel,
  ): Promise<boolean> {
    return RANK[await this.getAccessLevel(input)] >= RANK[required];
  }

  // Kept for the existing read-scoped RepoAccessGuard.
  async assertAccessAllowed(input: {
    owner: string;
    repo: string;
    username: string;
  }): Promise<boolean> {
    return this.assertLevelAtLeast(input, "read");
  }
}
```

- [ ] **Step 5: Run tests, then commit**

Run: `pnpm --filter @folio/github test repo-permission` → PASS.
Run: `pnpm --filter @folio/backend test repo-access.service` → PASS.

```bash
git add packages/github/src/repo-permission.ts packages/github/src/index.ts packages/github/test/repo-permission.test.ts apps/backend/src/domain/auth/repo-access.service.ts apps/backend/src/domain/auth/repo-access.service.test.ts apps/backend/src/infrastructure/github/github-oauth.adapter.ts
git commit -m "feat(backend): return action-specific GitHub permission levels"
```

---

## Task 12: Authorization error types + `WorkspaceRoleGuard`

**Files:**
- Modify: `apps/backend/src/support/error/error-type.ts`
- Create: `apps/backend/src/interfaces/api/authorization/require-workspace-role.decorator.ts`
- Create: `apps/backend/src/interfaces/api/authorization/workspace-role.guard.ts`
- Test: `apps/backend/src/interfaces/api/authorization/workspace-role.guard.test.ts`

**Interfaces:**
- Produces: `ErrorType.Forbidden` (403), `ErrorType.WorkspaceNotFound` (404), `ErrorType.NotEntitled` (403); `RequireWorkspaceRole(role: WorkspaceRole)` decorator (SetMetadata key `require_workspace_role`); `WorkspaceRoleGuard` that resolves `:workspaceId`, loads the actor's user row + membership, runs `canAccessWorkspace`, and sets `req.workspaceMembership` + `req.workspace` for downstream handlers.

- [ ] **Step 1: Add error types**

Add three entries to the `ErrorType` object in `error-type.ts`:

```typescript
  Forbidden: {
    code: "forbidden",
    statusCode: 403,
    message: "You are not allowed to perform this action.",
  },
  WorkspaceNotFound: {
    code: "workspace_not_found",
    statusCode: 404,
    message: "Workspace not found.",
  },
  NotEntitled: {
    code: "not_entitled",
    statusCode: 403,
    message: "Your plan does not include this feature.",
  },
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/backend/src/interfaces/api/authorization/workspace-role.guard.test.ts
import { GLOBAL_STATUS, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { usersRepo } from "@folio/db";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreException } from "../../../support/error/core-exception.js";
import { WorkspaceRoleGuard } from "./workspace-role.guard.js";

vi.mock("@folio/db", () => ({ usersRepo: { getById: vi.fn() } }));

function ctx(params: Record<string, string>, user: { id: string }) {
  const req: Record<string, unknown> = { params, user };
  return {
    getRequest: () => req,
    _req: req,
    switchToHttp() {
      return { getRequest: () => req };
    },
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
}

describe("WorkspaceRoleGuard", () => {
  const membership = {
    getMembership: vi.fn(),
  };
  const resolver = { resolveById: vi.fn() };
  let reflector: Reflector;
  let guard: WorkspaceRoleGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    reflector = new Reflector();
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(WORKSPACE_ROLE.ADMIN);
    guard = new WorkspaceRoleGuard(reflector, resolver as never, membership as never);
  });

  it("allows an active admin", async () => {
    resolver.resolveById.mockResolvedValue({ id: "ws1", githubAccountId: 1 });
    vi.mocked(usersRepo.getById).mockResolvedValue({
      id: "u1",
      globalStatus: GLOBAL_STATUS.ACTIVE,
      isSystemAdmin: false,
    } as never);
    membership.getMembership.mockResolvedValue({
      role: WORKSPACE_ROLE.ADMIN,
      status: MEMBERSHIP_STATUS.ACTIVE,
    });

    await expect(
      guard.canActivate(ctx({ workspaceId: "ws1" }, { id: "u1" })),
    ).resolves.toBe(true);
  });

  it("denies a reviewer with Forbidden", async () => {
    resolver.resolveById.mockResolvedValue({ id: "ws1", githubAccountId: 1 });
    vi.mocked(usersRepo.getById).mockResolvedValue({
      id: "u1",
      globalStatus: GLOBAL_STATUS.ACTIVE,
      isSystemAdmin: false,
    } as never);
    membership.getMembership.mockResolvedValue({
      role: WORKSPACE_ROLE.REVIEWER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    });

    await expect(
      guard.canActivate(ctx({ workspaceId: "ws1" }, { id: "u1" })),
    ).rejects.toBeInstanceOf(CoreException);
  });
});
```

- [ ] **Step 3: Write the decorator and guard**

```typescript
// apps/backend/src/interfaces/api/authorization/require-workspace-role.decorator.ts
import { SetMetadata } from "@nestjs/common";
import type { WorkspaceRole } from "@folio/types";

export const REQUIRE_WORKSPACE_ROLE = "require_workspace_role";
export const RequireWorkspaceRole = (role: WorkspaceRole) =>
  SetMetadata(REQUIRE_WORKSPACE_ROLE, role);
```

```typescript
// apps/backend/src/interfaces/api/authorization/workspace-role.guard.ts
import { type WorkspaceMemberRow, type WorkspaceRow, usersRepo } from "@folio/db";
import type { WorkspaceRole } from "@folio/types";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { canAccessWorkspace } from "../../../domain/authorization/authorization-policy.js";
import { WorkspaceResolver } from "../../../infrastructure/authorization/workspace-resolver.js";
import { WorkspaceMembershipService } from "../../../infrastructure/authorization/workspace-membership.service.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import { REQUIRE_WORKSPACE_ROLE } from "./require-workspace-role.decorator.js";
import type { AuthedRequest } from "../common/session-auth.guard.js";

export interface WorkspaceScopedRequest extends AuthedRequest {
  workspace?: WorkspaceRow;
  workspaceMembership?: WorkspaceMemberRow;
}

// Folio role axis. Runs after SessionAuthGuard; sets req.workspace + membership.
@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(WorkspaceResolver) private readonly resolver: WorkspaceResolver,
    @Inject(WorkspaceMembershipService) private readonly membership: WorkspaceMembershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<WorkspaceRole>(REQUIRE_WORKSPACE_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<WorkspaceScopedRequest>();
    const workspaceId =
      typeof request.params?.workspaceId === "string" ? request.params.workspaceId : undefined;
    const user = request.user;
    if (!workspaceId || !user) {
      throw new CoreException(ErrorType.Forbidden);
    }
    const workspace = await this.resolver.resolveById(workspaceId);
    if (!workspace) {
      throw new CoreException(ErrorType.WorkspaceNotFound);
    }
    const actorRow = await usersRepo.getById(user.id);
    const membership = await this.membership.getMembership(workspaceId, user.id);
    if (!actorRow || !membership) {
      throw new CoreException(ErrorType.Forbidden);
    }
    const decision = canAccessWorkspace(
      { globalStatus: actorRow.globalStatus, isSystemAdmin: actorRow.isSystemAdmin },
      { role: membership.role, status: membership.status },
      required,
    );
    if (!decision.allow) {
      throw new CoreException(ErrorType.Forbidden);
    }
    request.workspace = workspace;
    request.workspaceMembership = membership;
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @folio/backend test workspace-role.guard`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/support/error/error-type.ts apps/backend/src/interfaces/api/authorization/require-workspace-role.decorator.ts apps/backend/src/interfaces/api/authorization/workspace-role.guard.ts apps/backend/src/interfaces/api/authorization/workspace-role.guard.test.ts
git commit -m "feat(backend): add workspace role guard and error types"
```

---

## Task 13: Global-status + system-admin guards

**Files:**
- Create: `apps/backend/src/interfaces/api/authorization/require-global-status.decorator.ts`
- Create: `apps/backend/src/interfaces/api/authorization/global-status.guard.ts`
- Create: `apps/backend/src/interfaces/api/authorization/system-admin.guard.ts`
- Test: `apps/backend/src/interfaces/api/authorization/system-admin.guard.test.ts`

**Interfaces:**
- Produces: `RequireGlobalStatus(status)` decorator + `GlobalStatusGuard` (defaults to requiring `active` when metadata absent); `SystemAdminGuard` (no decorator — apply with `@UseGuards`). Both load the actor via `usersRepo.getById(req.user.id)` and throw `ErrorType.Forbidden` on failure.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/interfaces/api/authorization/system-admin.guard.test.ts
import { usersRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreException } from "../../../support/error/core-exception.js";
import { SystemAdminGuard } from "./system-admin.guard.js";

vi.mock("@folio/db", () => ({ usersRepo: { getById: vi.fn() } }));

function ctx(user?: { id: string }) {
  const req = { user };
  return { switchToHttp: () => ({ getRequest: () => req }) } as never;
}

describe("SystemAdminGuard", () => {
  const guard = new SystemAdminGuard();
  beforeEach(() => vi.clearAllMocks());

  it("allows the system admin", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue({ id: "u1", isSystemAdmin: true } as never);
    await expect(guard.canActivate(ctx({ id: "u1" }))).resolves.toBe(true);
  });

  it("denies a non-admin", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue({ id: "u2", isSystemAdmin: false } as never);
    await expect(guard.canActivate(ctx({ id: "u2" }))).rejects.toBeInstanceOf(CoreException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/backend test system-admin.guard`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the decorator + guards**

```typescript
// apps/backend/src/interfaces/api/authorization/require-global-status.decorator.ts
import { SetMetadata } from "@nestjs/common";
import type { GlobalStatus } from "@folio/types";

export const REQUIRE_GLOBAL_STATUS = "require_global_status";
export const RequireGlobalStatus = (status: GlobalStatus) =>
  SetMetadata(REQUIRE_GLOBAL_STATUS, status);
```

```typescript
// apps/backend/src/interfaces/api/authorization/global-status.guard.ts
import { usersRepo } from "@folio/db";
import { GLOBAL_STATUS, type GlobalStatus } from "@folio/types";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import type { AuthedRequest } from "../common/session-auth.guard.js";
import { REQUIRE_GLOBAL_STATUS } from "./require-global-status.decorator.js";

@Injectable()
export class GlobalStatusGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<GlobalStatus>(REQUIRE_GLOBAL_STATUS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? GLOBAL_STATUS.ACTIVE;
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) {
      throw new CoreException(ErrorType.Unauthorized);
    }
    const actor = await usersRepo.getById(request.user.id);
    if (!actor || actor.globalStatus !== required) {
      throw new CoreException(ErrorType.Forbidden);
    }
    return true;
  }
}
```

```typescript
// apps/backend/src/interfaces/api/authorization/system-admin.guard.ts
import { usersRepo } from "@folio/db";
import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import type { AuthedRequest } from "../common/session-auth.guard.js";

// Global service-role axis (Decision 13/18). Independent of workspace roles.
@Injectable()
export class SystemAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) {
      throw new CoreException(ErrorType.Unauthorized);
    }
    const actor = await usersRepo.getById(request.user.id);
    if (!actor?.isSystemAdmin) {
      throw new CoreException(ErrorType.Forbidden);
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @folio/backend test system-admin.guard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/interfaces/api/authorization/require-global-status.decorator.ts apps/backend/src/interfaces/api/authorization/global-status.guard.ts apps/backend/src/interfaces/api/authorization/system-admin.guard.ts apps/backend/src/interfaces/api/authorization/system-admin.guard.test.ts
git commit -m "feat(backend): add global-status and system-admin guards"
```

---

## Task 14: `EntitlementGuard` + `@RequireEntitlement`

**Files:**
- Create: `apps/backend/src/interfaces/api/authorization/require-entitlement.decorator.ts`
- Create: `apps/backend/src/interfaces/api/authorization/entitlement.guard.ts`
- Test: `apps/backend/src/interfaces/api/authorization/entitlement.guard.test.ts`

**Interfaces:**
- Produces: `RequireEntitlement(feature)` decorator (SetMetadata `require_entitlement`); `EntitlementGuard` that reads the actor's `globalStatus`, calls `EntitlementService.canUseFeature`, and throws `ErrorType.NotEntitled` on denial. With `AlwaysEntitledService` wired, active users always pass.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/interfaces/api/authorization/entitlement.guard.test.ts
import { ENTITLEMENT_FEATURE, GLOBAL_STATUS } from "@folio/types";
import { usersRepo } from "@folio/db";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlwaysEntitledService } from "../../../domain/authorization/entitlement.service.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { EntitlementGuard } from "./entitlement.guard.js";

vi.mock("@folio/db", () => ({ usersRepo: { getById: vi.fn() } }));

function ctx(user?: { id: string }) {
  const req = { user };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
}

describe("EntitlementGuard", () => {
  let guard: EntitlementGuard;
  beforeEach(() => {
    vi.clearAllMocks();
    const reflector = new Reflector();
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(ENTITLEMENT_FEATURE.PR_ANALYSIS);
    guard = new EntitlementGuard(reflector, new AlwaysEntitledService());
  });

  it("passes an active user (always-entitled)", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue({
      id: "u1",
      globalStatus: GLOBAL_STATUS.ACTIVE,
    } as never);
    await expect(guard.canActivate(ctx({ id: "u1" }))).resolves.toBe(true);
  });

  it("blocks a suspended user", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue({
      id: "u2",
      globalStatus: GLOBAL_STATUS.SUSPENDED,
    } as never);
    await expect(guard.canActivate(ctx({ id: "u2" }))).rejects.toBeInstanceOf(CoreException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/backend test entitlement.guard`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the decorator and guard**

```typescript
// apps/backend/src/interfaces/api/authorization/require-entitlement.decorator.ts
import { SetMetadata } from "@nestjs/common";
import type { EntitlementFeature } from "@folio/types";

export const REQUIRE_ENTITLEMENT = "require_entitlement";
export const RequireEntitlement = (feature: EntitlementFeature) =>
  SetMetadata(REQUIRE_ENTITLEMENT, feature);
```

```typescript
// apps/backend/src/interfaces/api/authorization/entitlement.guard.ts
import { usersRepo } from "@folio/db";
import type { EntitlementFeature } from "@folio/types";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EntitlementService } from "../../../domain/authorization/entitlement.service.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import type { AuthedRequest } from "../common/session-auth.guard.js";
import { REQUIRE_ENTITLEMENT } from "./require-entitlement.decorator.js";

// USER-scoped entitlement axis (Decision 3/12). No-op today (AlwaysEntitled),
// wired so a real subscription check activates by swapping EntitlementService.
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<EntitlementFeature>(REQUIRE_ENTITLEMENT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) {
      throw new CoreException(ErrorType.Unauthorized);
    }
    const actor = await usersRepo.getById(request.user.id);
    if (!actor) {
      throw new CoreException(ErrorType.Unauthorized);
    }
    const decision = await this.entitlements.canUseFeature({
      userId: actor.id,
      globalStatus: actor.globalStatus,
      feature,
    });
    if (!decision.entitled) {
      throw new CoreException(ErrorType.NotEntitled);
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @folio/backend test entitlement.guard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/interfaces/api/authorization/require-entitlement.decorator.ts apps/backend/src/interfaces/api/authorization/entitlement.guard.ts apps/backend/src/interfaces/api/authorization/entitlement.guard.test.ts
git commit -m "feat(backend): add entitlement guard wired to always-entitled seam"
```

---

## Task 15: system_admin bootstrap + remove hardcoded admin + `AuthorizationModule`

**Files:**
- Modify: `apps/backend/src/config.ts` (add `SYSTEM_ADMIN_BOOTSTRAP_GITHUB_ID`)
- Create: `apps/backend/src/domain/authorization/system-admin-bootstrap.ts`
- Modify: `apps/backend/src/application/auth/auth.facade.ts` (call bootstrap on login), `apps/backend/src/interfaces/api/common/session-auth.guard.ts` (use `globalStatus === active`)
- Create: `apps/backend/src/application/authorization/authorization.module.ts`
- Modify: `apps/backend/src/app.module.ts` (import `AuthorizationModule`)
- Test: `apps/backend/src/domain/authorization/system-admin-bootstrap.test.ts`

**Interfaces:**
- Consumes: `usersRepo`.
- Produces: `bootstrapSystemAdmin(githubUserId, bootstrapId): Promise<void>` — promotes the user whose `githubUserId` matches `bootstrapId` to `isSystemAdmin=true` ONLY when no system admin exists yet (Decision 15); `AuthorizationModule` providing `WorkspaceResolver`, `WorkspaceMembershipService`, `{ provide: EntitlementService, useClass: AlwaysEntitledService }`, and all four guards, exporting the guards + services.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/domain/authorization/system-admin-bootstrap.test.ts
import { usersRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapSystemAdmin } from "./system-admin-bootstrap.js";

vi.mock("@folio/db", () => ({
  usersRepo: { getSystemAdmin: vi.fn(), getByGithubId: vi.fn(), setSystemAdmin: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe("bootstrapSystemAdmin", () => {
  it("promotes the configured user when no system admin exists", async () => {
    vi.mocked(usersRepo.getSystemAdmin).mockResolvedValue(null);
    vi.mocked(usersRepo.getByGithubId).mockResolvedValue({ id: "u1", githubUserId: 42 } as never);

    await bootstrapSystemAdmin(42, 42);

    expect(usersRepo.setSystemAdmin).toHaveBeenCalledWith("u1", true);
  });

  it("does nothing when a system admin already exists", async () => {
    vi.mocked(usersRepo.getSystemAdmin).mockResolvedValue({ id: "existing" } as never);
    await bootstrapSystemAdmin(42, 42);
    expect(usersRepo.setSystemAdmin).not.toHaveBeenCalled();
  });

  it("does nothing for a non-matching github id", async () => {
    vi.mocked(usersRepo.getSystemAdmin).mockResolvedValue(null);
    await bootstrapSystemAdmin(99, 42);
    expect(usersRepo.getByGithubId).not.toHaveBeenCalled();
    expect(usersRepo.setSystemAdmin).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/backend test system-admin-bootstrap`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the bootstrap**

```typescript
// apps/backend/src/domain/authorization/system-admin-bootstrap.ts
import { usersRepo } from "@folio/db";

// One-time bootstrap (Decision 15): promote the configured GitHub user to
// system_admin only while none exists. Afterwards the setting grants nothing.
export async function bootstrapSystemAdmin(
  githubUserId: number,
  bootstrapGithubId: number | undefined,
): Promise<void> {
  if (!bootstrapGithubId || githubUserId !== bootstrapGithubId) {
    return;
  }
  const existing = await usersRepo.getSystemAdmin();
  if (existing) {
    return;
  }
  const user = await usersRepo.getByGithubId(githubUserId);
  if (user) {
    await usersRepo.setSystemAdmin(user.id, true);
  }
}
```

- [ ] **Step 4: Wire config, login, session guard, and module**

Add to `baseSchema` in `config.ts`:
```typescript
  // Stable GitHub numeric user id promoted to system_admin on first login while none exists.
  SYSTEM_ADMIN_BOOTSTRAP_GITHUB_ID: z.coerce.number().int().positive().optional(),
```

In `auth.facade.ts` `completeLogin`, after the `upsertByGithubId` call and before the status check, invoke the bootstrap and use `globalStatus`:
```typescript
    await bootstrapSystemAdmin(ghUser.id, config.SYSTEM_ADMIN_BOOTSTRAP_GITHUB_ID);
    const refreshed = await usersRepo.getByGithubId(ghUser.id);
    if (!refreshed || refreshed.globalStatus !== GLOBAL_STATUS.ACTIVE) {
      return { status: "pending" };
    }
    const session = await this.sessions.createForUser(refreshed.id);
    return { status: "approved", ...session };
```
(Import `bootstrapSystemAdmin`, `config`, and `GLOBAL_STATUS`. Remove the old `USER_STATUS.APPROVED` check. `completeDevLogin` should set `globalStatus: GLOBAL_STATUS.ACTIVE` on its upsert instead of `status: APPROVED`, and keep working for local dev.)

In `session-auth.guard.ts`, replace the approval check:
```typescript
    if (!user || user.globalStatus !== GLOBAL_STATUS.ACTIVE) {
      throw new CoreException(ErrorType.Unauthorized);
    }
```
(Import `GLOBAL_STATUS` from `@folio/types`; drop the `USER_STATUS` import.)

Create the module:
```typescript
// apps/backend/src/application/authorization/authorization.module.ts
import { Module } from "@nestjs/common";
import { AlwaysEntitledService, EntitlementService } from "../../domain/authorization/entitlement.service.js";
import { WorkspaceMembershipService } from "../../infrastructure/authorization/workspace-membership.service.js";
import { WorkspaceResolver } from "../../infrastructure/authorization/workspace-resolver.js";
import { EntitlementGuard } from "../../interfaces/api/authorization/entitlement.guard.js";
import { GlobalStatusGuard } from "../../interfaces/api/authorization/global-status.guard.js";
import { SystemAdminGuard } from "../../interfaces/api/authorization/system-admin.guard.js";
import { WorkspaceRoleGuard } from "../../interfaces/api/authorization/workspace-role.guard.js";

// Shared authorization stack (Folio-role + global + entitlement axes). Feature
// modules import this to apply the guards; EntitlementService is swappable.
@Module({
  providers: [
    WorkspaceResolver,
    WorkspaceMembershipService,
    { provide: EntitlementService, useClass: AlwaysEntitledService },
    WorkspaceRoleGuard,
    GlobalStatusGuard,
    SystemAdminGuard,
    EntitlementGuard,
  ],
  exports: [
    WorkspaceResolver,
    WorkspaceMembershipService,
    EntitlementService,
    WorkspaceRoleGuard,
    GlobalStatusGuard,
    SystemAdminGuard,
    EntitlementGuard,
  ],
})
export class AuthorizationModule {}
```

Add `AuthorizationModule` to the `imports` array in `app.module.ts`.

- [ ] **Step 5: Run tests, verify boot, commit**

Run: `pnpm --filter @folio/backend test system-admin-bootstrap` → PASS.
Run: `pnpm --filter @folio/backend test auth.facade` (if present) and `pnpm --filter @folio/backend test session-auth` → PASS (update any assertions referencing the old status).

```bash
git add apps/backend/src/config.ts apps/backend/src/domain/authorization/system-admin-bootstrap.ts apps/backend/src/domain/authorization/system-admin-bootstrap.test.ts apps/backend/src/application/auth/auth.facade.ts apps/backend/src/interfaces/api/common/session-auth.guard.ts apps/backend/src/application/authorization/authorization.module.ts apps/backend/src/app.module.ts
git commit -m "feat(backend): bootstrap system_admin and wire authorization module"
```

---

## Task 16: Workspace members facade + controller

**Files:**
- Create: `apps/backend/src/application/authorization/workspace-members.facade.ts`
- Create: `apps/backend/src/interfaces/api/workspaces/workspace-members.controller.ts`
- Modify: `apps/backend/src/application/authorization/authorization.module.ts` (add facade + controller)
- Test: `apps/backend/src/application/authorization/workspace-members.facade.test.ts`

**Interfaces:**
- Consumes: `WorkspaceMembershipService`, `AuthorizationPolicy` functions, `workspaceMembersRepo`, `usersRepo`, `auditLogsRepo`, db `getDb().transaction`.
- Produces: `WorkspaceMembersFacade` with `list(workspaceId)`, `suspend/restore/remove({ workspaceId, actorUserId, targetUserId })`, `changeRole({ workspaceId, actorUserId, targetUserId, toRole })`, `transferOwnership({ workspaceId, actorUserId, targetUserId })` — each loads actor + target memberships, runs the policy, and throws `CoreException(ErrorType.Forbidden)` on denial. Routes are `@Controller("api/v1/workspaces/:workspaceId/members")` guarded by `SessionAuthGuard` + `WorkspaceRoleGuard` with per-route `@RequireWorkspaceRole`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/application/authorization/workspace-members.facade.test.ts
import { MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { workspaceMembersRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreException } from "../../support/error/core-exception.js";
import { WorkspaceMembersFacade } from "./workspace-members.facade.js";

vi.mock("@folio/db", () => ({
  workspaceMembersRepo: { getMembership: vi.fn(), listByWorkspace: vi.fn() },
}));

const membershipSvc = {
  suspendReviewer: vi.fn(),
  restoreReviewer: vi.fn(),
  removeReviewer: vi.fn(),
  changeRole: vi.fn(),
};

const active = MEMBERSHIP_STATUS.ACTIVE;

describe("WorkspaceMembersFacade.suspend", () => {
  let facade: WorkspaceMembersFacade;
  beforeEach(() => {
    vi.clearAllMocks();
    facade = new WorkspaceMembersFacade(membershipSvc as never);
  });

  it("lets an admin suspend a reviewer", async () => {
    vi.mocked(workspaceMembersRepo.getMembership).mockImplementation(async (_ws, userId) =>
      userId === "admin1"
        ? ({ id: "am", role: WORKSPACE_ROLE.ADMIN, status: active } as never)
        : ({ id: "rm", role: WORKSPACE_ROLE.REVIEWER, status: active } as never),
    );

    await facade.suspend({ workspaceId: "ws1", actorUserId: "admin1", targetUserId: "rev1" });

    expect(membershipSvc.suspendReviewer).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws1", membershipId: "rm", actorUserId: "admin1" }),
    );
  });

  it("forbids an admin suspending another admin", async () => {
    vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue({
      id: "x",
      role: WORKSPACE_ROLE.ADMIN,
      status: active,
    } as never);

    await expect(
      facade.suspend({ workspaceId: "ws1", actorUserId: "admin1", targetUserId: "admin2" }),
    ).rejects.toBeInstanceOf(CoreException);
    expect(membershipSvc.suspendReviewer).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/backend test workspace-members.facade`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the facade**

```typescript
// apps/backend/src/application/authorization/workspace-members.facade.ts
import {
  type WorkspaceMemberRow,
  auditLogsRepo,
  getDb,
  workspaceMembersRepo,
} from "@folio/db";
import { AUDIT_ACTION, MEMBERSHIP_STATUS, WORKSPACE_ROLE, type WorkspaceRole } from "@folio/types";
import { Inject, Injectable } from "@nestjs/common";
import {
  canManageMember,
  canTransferOwnership,
} from "../../domain/authorization/authorization-policy.js";
import { WorkspaceMembershipService } from "../../infrastructure/authorization/workspace-membership.service.js";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";

export interface MemberCommand {
  workspaceId: string;
  actorUserId: string;
  targetUserId: string;
}

@Injectable()
export class WorkspaceMembersFacade {
  constructor(
    @Inject(WorkspaceMembershipService) private readonly membership: WorkspaceMembershipService,
  ) {}

  list(workspaceId: string): Promise<WorkspaceMemberRow[]> {
    return workspaceMembersRepo.listByWorkspace(workspaceId);
  }

  private async loadPair(cmd: MemberCommand) {
    const actor = await workspaceMembersRepo.getMembership(cmd.workspaceId, cmd.actorUserId);
    const target = await workspaceMembersRepo.getMembership(cmd.workspaceId, cmd.targetUserId);
    if (!actor || !target) {
      throw new CoreException(ErrorType.Forbidden);
    }
    return { actor, target };
  }

  async suspend(cmd: MemberCommand): Promise<void> {
    const { actor, target } = await this.loadPair(cmd);
    if (!canManageMember(actor, target, "suspend").allow) {
      throw new CoreException(ErrorType.Forbidden);
    }
    await this.membership.suspendReviewer({
      workspaceId: cmd.workspaceId,
      membershipId: target.id,
      actorUserId: cmd.actorUserId,
      targetUserId: cmd.targetUserId,
    });
  }

  async restore(cmd: MemberCommand): Promise<void> {
    const { actor, target } = await this.loadPair(cmd);
    if (!canManageMember(actor, target, "restore").allow) {
      throw new CoreException(ErrorType.Forbidden);
    }
    await this.membership.restoreReviewer({
      workspaceId: cmd.workspaceId,
      membershipId: target.id,
      actorUserId: cmd.actorUserId,
      targetUserId: cmd.targetUserId,
    });
  }

  async remove(cmd: MemberCommand): Promise<void> {
    const { actor, target } = await this.loadPair(cmd);
    if (!canManageMember(actor, target, "remove").allow) {
      throw new CoreException(ErrorType.Forbidden);
    }
    await this.membership.removeReviewer({
      workspaceId: cmd.workspaceId,
      membershipId: target.id,
      actorUserId: cmd.actorUserId,
      targetUserId: cmd.targetUserId,
    });
  }

  async changeRole(cmd: MemberCommand & { toRole: WorkspaceRole }): Promise<void> {
    const { actor, target } = await this.loadPair(cmd);
    const op = cmd.toRole === WORKSPACE_ROLE.REVIEWER ? "demote" : "elevate";
    if (!canManageMember(actor, target, op).allow) {
      throw new CoreException(ErrorType.Forbidden);
    }
    await this.membership.changeRole({
      workspaceId: cmd.workspaceId,
      membershipId: target.id,
      actorUserId: cmd.actorUserId,
      targetUserId: cmd.targetUserId,
      fromRole: target.role,
      toRole: cmd.toRole,
    });
  }

  // Atomic ownership transfer (Decision 8): demote current owner, promote target.
  async transferOwnership(cmd: MemberCommand): Promise<void> {
    const { actor, target } = await this.loadPair(cmd);
    if (!canTransferOwnership(actor).allow) {
      throw new CoreException(ErrorType.Forbidden);
    }
    await getDb().transaction(async (tx) => {
      await workspaceMembersRepo.updateRole(actor.id, WORKSPACE_ROLE.ADMIN, cmd.actorUserId, tx);
      await workspaceMembersRepo.updateRole(target.id, WORKSPACE_ROLE.OWNER, cmd.actorUserId, tx);
      await auditLogsRepo.record(
        {
          actorUserId: cmd.actorUserId,
          action: AUDIT_ACTION.OWNER_TRANSFER,
          targetType: "workspace_member",
          targetId: cmd.targetUserId,
          workspaceId: cmd.workspaceId,
          before: { owner: cmd.actorUserId },
          after: { owner: cmd.targetUserId },
        },
        tx,
      );
    });
  }
}
```

- [ ] **Step 4: Write the controller**

```typescript
// apps/backend/src/interfaces/api/workspaces/workspace-members.controller.ts
import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { WORKSPACE_ROLE, WorkspaceRoleSchema } from "@folio/types";
import { z } from "zod";
import { BadRequestException } from "@nestjs/common";
import { WorkspaceMembersFacade } from "../../../application/authorization/workspace-members.facade.js";
import { RequireWorkspaceRole } from "../authorization/require-workspace-role.decorator.js";
import { WorkspaceRoleGuard } from "../authorization/workspace-role.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { type AuthedUser, SessionAuthGuard } from "../common/session-auth.guard.js";

const RoleBody = z.object({ role: WorkspaceRoleSchema });
const TransferBody = z.object({ userId: z.string().min(1) });

@Controller("api/v1/workspaces/:workspaceId/members")
@UseGuards(SessionAuthGuard, WorkspaceRoleGuard)
export class WorkspaceMembersController {
  constructor(@Inject(WorkspaceMembersFacade) private readonly members: WorkspaceMembersFacade) {}

  @Get()
  @RequireWorkspaceRole(WORKSPACE_ROLE.REVIEWER)
  async list(@Param("workspaceId") workspaceId: string) {
    return { members: await this.members.list(workspaceId) };
  }

  @Post(":userId/suspend")
  @RequireWorkspaceRole(WORKSPACE_ROLE.ADMIN)
  async suspend(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: AuthedUser,
  ) {
    await this.members.suspend({ workspaceId, actorUserId: user.id, targetUserId: userId });
    return { ok: true };
  }

  @Post(":userId/restore")
  @RequireWorkspaceRole(WORKSPACE_ROLE.ADMIN)
  async restore(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: AuthedUser,
  ) {
    await this.members.restore({ workspaceId, actorUserId: user.id, targetUserId: userId });
    return { ok: true };
  }

  @Delete(":userId")
  @RequireWorkspaceRole(WORKSPACE_ROLE.ADMIN)
  async remove(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: AuthedUser,
  ) {
    await this.members.remove({ workspaceId, actorUserId: user.id, targetUserId: userId });
    return { ok: true };
  }

  @Patch(":userId/role")
  @RequireWorkspaceRole(WORKSPACE_ROLE.OWNER)
  async changeRole(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthedUser,
  ) {
    const parsed = RoleBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("role must be owner, admin, or reviewer");
    }
    await this.members.changeRole({
      workspaceId,
      actorUserId: user.id,
      targetUserId: userId,
      toRole: parsed.data.role,
    });
    return { ok: true };
  }

  @Post("transfer-ownership")
  @RequireWorkspaceRole(WORKSPACE_ROLE.OWNER)
  async transfer(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthedUser,
  ) {
    const parsed = TransferBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("userId is required");
    }
    await this.members.transferOwnership({
      workspaceId,
      actorUserId: user.id,
      targetUserId: parsed.data.userId,
    });
    return { ok: true };
  }
}
```

Register `WorkspaceMembersFacade` (provider) and `WorkspaceMembersController` (controller) in `authorization.module.ts` (import the guards it already provides).

- [ ] **Step 5: Run test, then commit**

Run: `pnpm --filter @folio/backend test workspace-members.facade`
Expected: PASS.

```bash
git add apps/backend/src/application/authorization/workspace-members.facade.ts apps/backend/src/application/authorization/workspace-members.facade.test.ts apps/backend/src/interfaces/api/workspaces/workspace-members.controller.ts apps/backend/src/application/authorization/authorization.module.ts
git commit -m "feat(backend): add workspace member management API"
```

---

## Task 17: Global users facade + controller (replaces hardcoded admin)

**Files:**
- Create: `apps/backend/src/application/authorization/global-users.facade.ts`
- Create: `apps/backend/src/interfaces/api/admin/global-users.controller.ts`
- Modify: `apps/backend/src/interfaces/api/auth/auth.controller.ts` (remove `ADMIN_LOGIN`, `assertAdmin`, and the two `admin/users/*` routes — superseded)
- Modify: `apps/backend/src/application/authorization/authorization.module.ts`
- Test: `apps/backend/src/application/authorization/global-users.facade.test.ts`

**Interfaces:**
- Consumes: `usersRepo`, `auditLogsRepo`, `getDb().transaction`, `GLOBAL_STATUS`, `AUDIT_ACTION`.
- Produces: `GlobalUsersFacade` with `list()`, `approve({ actorUserId, targetUserId })` (pending→active), `suspend({ actorUserId, targetUserId })` (active→suspended), `transferSystemAdmin({ actorUserId, targetUserId })` (atomic demote+promote). Routes at `@Controller("api/v1/admin")` guarded by `SessionAuthGuard` + `SystemAdminGuard`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/application/authorization/global-users.facade.test.ts
import { AUDIT_ACTION, GLOBAL_STATUS } from "@folio/types";
import { auditLogsRepo, usersRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalUsersFacade } from "./global-users.facade.js";

vi.mock("@folio/db", () => ({
  usersRepo: { listAll: vi.fn(), setGlobalStatus: vi.fn(), getById: vi.fn() },
  auditLogsRepo: { record: vi.fn() },
}));

const facade = new GlobalUsersFacade();
beforeEach(() => vi.clearAllMocks());

describe("GlobalUsersFacade.approve", () => {
  it("moves a pending user to active and audits it", async () => {
    vi.mocked(usersRepo.getById).mockResolvedValue({
      id: "u1",
      globalStatus: GLOBAL_STATUS.PENDING,
    } as never);
    vi.mocked(usersRepo.setGlobalStatus).mockResolvedValue({
      id: "u1",
      globalStatus: GLOBAL_STATUS.ACTIVE,
    } as never);

    await facade.approve({ actorUserId: "root", targetUserId: "u1" });

    expect(usersRepo.setGlobalStatus).toHaveBeenCalledWith("u1", GLOBAL_STATUS.ACTIVE);
    expect(auditLogsRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTION.USER_APPROVE, workspaceId: null }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/backend test global-users.facade`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the facade**

```typescript
// apps/backend/src/application/authorization/global-users.facade.ts
import { type UserRow, auditLogsRepo, getDb, usersRepo } from "@folio/db";
import { AUDIT_ACTION, GLOBAL_STATUS } from "@folio/types";
import { Injectable } from "@nestjs/common";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";

export interface GlobalUserCommand {
  actorUserId: string;
  targetUserId: string;
}

@Injectable()
export class GlobalUsersFacade {
  list(): Promise<UserRow[]> {
    return usersRepo.listAll();
  }

  async approve(cmd: GlobalUserCommand): Promise<void> {
    const before = await usersRepo.getById(cmd.targetUserId);
    if (!before) {
      throw new CoreException(ErrorType.WorkspaceNotFound);
    }
    await usersRepo.setGlobalStatus(cmd.targetUserId, GLOBAL_STATUS.ACTIVE);
    await auditLogsRepo.record({
      actorUserId: cmd.actorUserId,
      action: AUDIT_ACTION.USER_APPROVE,
      targetType: "user",
      targetId: cmd.targetUserId,
      workspaceId: null,
      before: { globalStatus: before.globalStatus },
      after: { globalStatus: GLOBAL_STATUS.ACTIVE },
    });
  }

  async suspend(cmd: GlobalUserCommand): Promise<void> {
    const before = await usersRepo.getById(cmd.targetUserId);
    if (!before) {
      throw new CoreException(ErrorType.WorkspaceNotFound);
    }
    await usersRepo.setGlobalStatus(cmd.targetUserId, GLOBAL_STATUS.SUSPENDED);
    await auditLogsRepo.record({
      actorUserId: cmd.actorUserId,
      action: AUDIT_ACTION.USER_SUSPEND,
      targetType: "user",
      targetId: cmd.targetUserId,
      workspaceId: null,
      before: { globalStatus: before.globalStatus },
      after: { globalStatus: GLOBAL_STATUS.SUSPENDED },
    });
  }

  // Atomic system_admin transfer (Decision 18): exactly one at all times.
  async transferSystemAdmin(cmd: GlobalUserCommand): Promise<void> {
    await getDb().transaction(async (tx) => {
      await usersRepo.setSystemAdmin(cmd.actorUserId, false, tx);
      await usersRepo.setSystemAdmin(cmd.targetUserId, true, tx);
    });
  }
}
```

- [ ] **Step 4: Write the controller and prune `auth.controller.ts`**

```typescript
// apps/backend/src/interfaces/api/admin/global-users.controller.ts
import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { GlobalUsersFacade } from "../../../application/authorization/global-users.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { type AuthedUser, SessionAuthGuard } from "../common/session-auth.guard.js";

const TransferBody = z.object({ userId: z.string().min(1) });

@Controller("api/v1/admin")
@UseGuards(SessionAuthGuard, SystemAdminGuard)
export class GlobalUsersController {
  constructor(@Inject(GlobalUsersFacade) private readonly users: GlobalUsersFacade) {}

  @Get("users")
  async list() {
    const users = await this.users.list();
    return {
      users: users.map((u) => ({
        id: u.id,
        login: u.login,
        avatarUrl: u.avatarUrl,
        email: u.email,
        globalStatus: u.globalStatus,
        isSystemAdmin: u.isSystemAdmin,
        createdAt: u.createdAt,
      })),
    };
  }

  @Post("users/:id/approve")
  async approve(@CurrentUser() user: AuthedUser, @Param("id") id: string) {
    await this.users.approve({ actorUserId: user.id, targetUserId: id });
    return { ok: true };
  }

  @Post("users/:id/suspend")
  async suspend(@CurrentUser() user: AuthedUser, @Param("id") id: string) {
    await this.users.suspend({ actorUserId: user.id, targetUserId: id });
    return { ok: true };
  }

  @Post("system-admin/transfer")
  async transfer(@CurrentUser() user: AuthedUser, @Body() body: unknown) {
    const parsed = TransferBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("userId is required");
    }
    await this.users.transferSystemAdmin({ actorUserId: user.id, targetUserId: parsed.data.userId });
    return { ok: true };
  }
}
```

In `auth.controller.ts`: delete `const ADMIN_LOGIN = "KMGeon";`, the `assertAdmin` function, the `usersRepo` import, and the `pendingUsers` + `approveUser` handlers (now served by `GlobalUsersController`). Keep login/callback/me/logout untouched.

Register `GlobalUsersFacade` (provider) and `GlobalUsersController` (controller) in `authorization.module.ts`.

- [ ] **Step 5: Run test, then commit**

Run: `pnpm --filter @folio/backend test global-users.facade`
Expected: PASS.

```bash
git add apps/backend/src/application/authorization/global-users.facade.ts apps/backend/src/application/authorization/global-users.facade.test.ts apps/backend/src/interfaces/api/admin/global-users.controller.ts apps/backend/src/interfaces/api/auth/auth.controller.ts apps/backend/src/application/authorization/authorization.module.ts
git commit -m "feat(backend): add system-admin global user API, drop hardcoded admin"
```

---

## Task 18: Workspace claim + `/current` endpoint

**Files:**
- Create: `apps/backend/src/application/authorization/workspace-claim.facade.ts`
- Create: `apps/backend/src/interfaces/api/workspaces/workspace.controller.ts`
- Modify: `apps/backend/src/application/authorization/authorization.module.ts`
- Test: `apps/backend/src/application/authorization/workspace-claim.facade.test.ts`

**Interfaces:**
- Consumes: `WorkspaceResolver`, `WorkspaceMembershipService`, `workspacesRepo`, `workspaceMembersRepo`, `usersRepo`, `EntitlementService`, `ENTITLEMENT_FEATURE`.
- Produces: `WorkspaceClaimFacade.claimAsOwner({ userId, githubAccountId, accountLogin, accountType })` — upserts the workspace and creates/promotes the caller to `owner` when the workspace has no owner yet (Decision 16); `WorkspaceClaimFacade.currentContext(userId)` → `{ workspace, role, memberStatus, globalStatus, entitlements }` for the UI bootstrap. Route `GET /api/v1/workspaces/current` (SessionAuthGuard) and `POST /api/v1/workspaces/claim` (SessionAuthGuard).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/application/authorization/workspace-claim.facade.test.ts
import { ACCOUNT_TYPE, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { workspaceMembersRepo, workspacesRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceClaimFacade } from "./workspace-claim.facade.js";

vi.mock("@folio/db", () => ({
  workspacesRepo: { upsertByGithubAccountId: vi.fn() },
  workspaceMembersRepo: { listByWorkspace: vi.fn(), getMembership: vi.fn(), create: vi.fn() },
}));

const facade = new WorkspaceClaimFacade();
beforeEach(() => vi.clearAllMocks());

describe("WorkspaceClaimFacade.claimAsOwner", () => {
  it("binds the caller as owner when the workspace has no owner", async () => {
    vi.mocked(workspacesRepo.upsertByGithubAccountId).mockResolvedValue({ id: "ws1" } as never);
    vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([]);
    vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(null);
    vi.mocked(workspaceMembersRepo.create).mockResolvedValue({
      id: "m1",
      role: WORKSPACE_ROLE.OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    } as never);

    const result = await facade.claimAsOwner({
      userId: "u1",
      githubAccountId: 42,
      accountLogin: "acme",
      accountType: ACCOUNT_TYPE.ORGANIZATION,
    });

    expect(workspaceMembersRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: WORKSPACE_ROLE.OWNER }),
    );
    expect(result.role).toBe(WORKSPACE_ROLE.OWNER);
  });

  it("does not create a second owner", async () => {
    vi.mocked(workspacesRepo.upsertByGithubAccountId).mockResolvedValue({ id: "ws1" } as never);
    vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([
      { id: "existing", role: WORKSPACE_ROLE.OWNER, status: MEMBERSHIP_STATUS.ACTIVE } as never,
    ]);
    vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(null);
    vi.mocked(workspaceMembersRepo.create).mockResolvedValue({
      id: "m2",
      role: WORKSPACE_ROLE.REVIEWER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    } as never);

    const result = await facade.claimAsOwner({
      userId: "u2",
      githubAccountId: 42,
      accountLogin: "acme",
      accountType: ACCOUNT_TYPE.ORGANIZATION,
    });

    expect(result.role).not.toBe(WORKSPACE_ROLE.OWNER);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/backend test workspace-claim.facade`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the facade**

```typescript
// apps/backend/src/application/authorization/workspace-claim.facade.ts
import {
  type WorkspaceMemberRow,
  usersRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import {
  ACCOUNT_TYPE,
  ENTITLEMENT_FEATURE,
  MEMBERSHIP_STATUS,
  WORKSPACE_ROLE,
  type AccountType,
  type EntitlementFeature,
} from "@folio/types";
import { Inject, Injectable } from "@nestjs/common";
import { EntitlementService } from "../../domain/authorization/entitlement.service.js";
import { WorkspaceResolver } from "../../infrastructure/authorization/workspace-resolver.js";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";

export interface ClaimInput {
  userId: string;
  githubAccountId: number;
  accountLogin: string;
  accountType: AccountType;
}

@Injectable()
export class WorkspaceClaimFacade {
  constructor(
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
    @Inject(WorkspaceResolver) private readonly resolver: WorkspaceResolver,
  ) {}

  // New install / claim (Decision 16): first claimant with no existing owner becomes owner.
  async claimAsOwner(input: ClaimInput): Promise<WorkspaceMemberRow> {
    const workspace = await workspacesRepo.upsertByGithubAccountId({
      githubAccountId: input.githubAccountId,
      accountLogin: input.accountLogin,
      accountType: input.accountType,
    });
    const existing = await workspaceMembersRepo.getMembership(workspace.id, input.userId);
    if (existing) {
      return existing;
    }
    const members = await workspaceMembersRepo.listByWorkspace(workspace.id);
    const hasOwner = members.some((m) => m.role === WORKSPACE_ROLE.OWNER);
    return workspaceMembersRepo.create({
      workspaceId: workspace.id,
      userId: input.userId,
      role: hasOwner ? WORKSPACE_ROLE.REVIEWER : WORKSPACE_ROLE.OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    });
  }

  async currentContext(userId: string) {
    const user = await usersRepo.getById(userId);
    if (!user) {
      throw new CoreException(ErrorType.Unauthorized);
    }
    // A user may belong to multiple workspaces; the UI bootstrap uses the first
    // membership. (Workspace switching is out of scope for this task.)
    const workspace = await this.resolver.firstWorkspaceForUser(userId);
    const membership = workspace
      ? await workspaceMembersRepo.getMembership(workspace.id, userId)
      : null;
    const entitlements: EntitlementFeature[] = [];
    for (const feature of Object.values(ENTITLEMENT_FEATURE)) {
      const decision = await this.entitlements.canUseFeature({
        userId,
        globalStatus: user.globalStatus,
        feature,
      });
      if (decision.entitled) {
        entitlements.push(feature);
      }
    }
    return {
      workspace: workspace ? { id: workspace.id, accountLogin: workspace.accountLogin } : null,
      role: membership?.role ?? null,
      memberStatus: membership?.status ?? null,
      globalStatus: user.globalStatus,
      isSystemAdmin: user.isSystemAdmin,
      entitlements,
    };
  }
}
```

> This task adds two supporting methods, both consumed again in Task 19:
> - `workspaceMembersRepo.listByUser(userId)` in `packages/db/src/repos/workspace-members.ts` (select where `eq(workspaceMembers.userId, userId)`), with an e2e assertion appended to `packages/db/test/workspace-members.e2e.test.ts`.
> - `WorkspaceResolver.firstWorkspaceForUser(userId)` in `workspace-resolver.ts` — calls `workspaceMembersRepo.listByUser(userId)`, then `workspacesRepo.getById(first.workspaceId)`, returning `null` when the user has no membership.
>
> The `claimAsOwner` tests construct `new WorkspaceClaimFacade()` with no args (they exercise only `claimAsOwner`, which touches neither injected dep); `currentContext` is covered by the Task 24 smoke check.

- [ ] **Step 4: Write the controller**

```typescript
// apps/backend/src/interfaces/api/workspaces/workspace.controller.ts
import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { WorkspaceClaimFacade } from "../../../application/authorization/workspace-claim.facade.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { type AuthedUser, SessionAuthGuard } from "../common/session-auth.guard.js";

@Controller("api/v1/workspaces")
@UseGuards(SessionAuthGuard)
export class WorkspaceController {
  constructor(@Inject(WorkspaceClaimFacade) private readonly claim: WorkspaceClaimFacade) {}

  @Get("current")
  async current(@CurrentUser() user: AuthedUser) {
    return this.claim.currentContext(user.id);
  }
}
```

> The `POST /claim` route depends on reading the installer's GitHub account id from the OAuth/installation flow. Wire it in the same controller once `AuthFacade` exposes the numeric account id from `completeLogin` (Task 15 already threads GitHub identity). For this task, ship `GET /current` and add the `claim` POST handler that calls `claimAsOwner` with the account id resolved from `WorkspaceResolver.listInstallationsForWorkspace`; if the installer identity is not yet available server-side, guard the handler to return `ErrorType.WorkspaceNotFound` rather than silently no-op.

Register `WorkspaceClaimFacade` (provider) and `WorkspaceController` (controller) in `authorization.module.ts`.

- [ ] **Step 5: Run test, then commit**

Run: `pnpm --filter @folio/backend test workspace-claim.facade`
Expected: PASS.

```bash
git add apps/backend/src/application/authorization/workspace-claim.facade.ts apps/backend/src/application/authorization/workspace-claim.facade.test.ts apps/backend/src/interfaces/api/workspaces/workspace.controller.ts apps/backend/src/application/authorization/authorization.module.ts packages/db/src/repos/workspace-members.ts packages/db/test/workspace-members.e2e.test.ts
git commit -m "feat(backend): add workspace claim and current-context endpoints"
```

---

## Task 19: Retrofit existing endpoints with the three axes

**Files:**
- Modify: `apps/backend/src/interfaces/api/pulls/pulls.controller.ts`
- Modify: `apps/backend/src/interfaces/api/repositories/repositories.controller.ts`
- Modify: `apps/backend/src/application/repositories/repositories.facade.ts`
- Modify: `apps/backend/src/application/review/review.module.ts`, `apps/backend/src/application/repositories/repositories.module.ts` (import `AuthorizationModule`)
- Test: update `apps/backend/src/application/repositories/repositories.facade.test.ts`

**Interfaces:**
- Consumes: `RepoAccessService.assertLevelAtLeast`, `WorkspaceResolver`, `RequireEntitlement`, `EntitlementGuard`.
- Produces: `RepositoriesFacade` methods now take a `userId` and resolve the workspace via `WorkspaceResolver` instead of `accountLogin == login`; `PullsController.createReview` gains a body-scoped repo-access + entitlement check.

- [ ] **Step 1: Update the repositories facade test**

Replace the `RepositoriesFacade` test setup so `listForUser`/`setEnabled` are called with `{ userId }` and mock `WorkspaceResolver` + `repositoriesRepo.listByWorkspaceId`. Add a case asserting a repo from another workspace is not returned.

```typescript
// apps/backend/src/application/repositories/repositories.facade.test.ts (new shape, excerpt)
import { repositoriesRepo } from "@folio/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesFacade } from "./repositories.facade.js";

vi.mock("@folio/db", () => ({
  repositoriesRepo: { listByWorkspaceId: vi.fn(), setFolioEnabled: vi.fn(), getById: vi.fn() },
}));

const resolver = { firstWorkspaceForUser: vi.fn() };

describe("RepositoriesFacade", () => {
  let facade: RepositoriesFacade;
  beforeEach(() => {
    vi.clearAllMocks();
    facade = new RepositoriesFacade(resolver as never);
  });

  it("lists only repositories in the user's workspace", async () => {
    resolver.firstWorkspaceForUser.mockResolvedValue({ id: "ws1" });
    vi.mocked(repositoriesRepo.listByWorkspaceId).mockResolvedValue([
      {
        id: "repo-1",
        installationId: "i1",
        workspaceId: "ws1",
        githubRepoId: 456,
        owner: "acme",
        name: "widget",
        fullName: "acme/widget",
        private: true,
        defaultBranch: "main",
        folioEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await facade.listForUser({ userId: "u1" });
    expect(repositoriesRepo.listByWorkspaceId).toHaveBeenCalledWith("ws1");
    expect(result.repositories).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/backend test repositories.facade`
Expected: FAIL — `listByWorkspaceId` / new constructor not defined.

- [ ] **Step 3: Rework the facade + add repo method**

Add `repositoriesRepo.listByWorkspaceId(workspaceId)` to `packages/db/src/repos/repositories.ts` (select where `eq(repositories.workspaceId, workspaceId)`), with an e2e assertion in `repos.e2e.test.ts`. Reuse the `WorkspaceResolver.firstWorkspaceForUser(userId)` method added in Task 18 to resolve the caller's workspace. Rewrite `RepositoriesFacade` to take `WorkspaceResolver` via constructor injection and resolve the workspace from `userId`; keep the `toRepository` mapper but include `workspaceId`. Update `RepositoriesController` to pass `{ userId: user.id }`, add `@RequireEntitlement(ENTITLEMENT_FEATURE.REPO_ACTIVATION)` + `EntitlementGuard` to `setEnabled`, and record a `repo_activation_change` audit row in `setEnabled` via `auditLogsRepo`.

- [ ] **Step 4: Harden `PullsController.createReview`**

Replace the follow-up comment and session-only guard on `@Post()` with an explicit body-scoped check:

```typescript
  @Post()
  @UseGuards(EntitlementGuard)
  @RequireEntitlement(ENTITLEMENT_FEATURE.PR_ANALYSIS)
  async createReview(@Body() body: CreateReviewBody, @CurrentUser() user: AuthedUser) {
    // Body carries owner/repo, so the route-param RepoAccessGuard can't gate it:
    // require write+ on the target repo before triggering analysis (Decision 17).
    const allowed = await this.repoAccess.assertLevelAtLeast(
      { owner: body.owner, repo: body.repo, username: user.login },
      "write",
    );
    if (!allowed) {
      throw new CoreException(ErrorType.RepoAccessDenied);
    }
    return this.reviewPull.run({ owner: body.owner, repo: body.repo, number: body.number });
  }
```

Inject `RepoAccessService` into `PullsController` (add to its constructor + the `ReviewModule` providers/imports via `AuthorizationModule`/`AuthModule`). Add `EntitlementGuard`/`RepoAccessGuard` `@RequireEntitlement(REVIEW_READ|REVIEW_STATE_MUTATION|COMMENT)` on the read/state/comment routes per Section 5 of the spec.

- [ ] **Step 5: Run tests, then commit**

Run: `pnpm --filter @folio/backend test repositories.facade` → PASS.
Run: `pnpm --filter @folio/backend test` (full backend suite) → PASS.

```bash
git add apps/backend/src/interfaces/api/pulls/pulls.controller.ts apps/backend/src/interfaces/api/repositories/repositories.controller.ts apps/backend/src/application/repositories/repositories.facade.ts apps/backend/src/application/repositories/repositories.facade.test.ts apps/backend/src/application/review/review.module.ts apps/backend/src/application/repositories/repositories.module.ts apps/backend/src/infrastructure/authorization/workspace-resolver.ts packages/db/src/repos/repositories.ts packages/db/test/repos.e2e.test.ts
git commit -m "feat(backend): enforce three-axis authorization on pulls and repositories"
```

---

## Task 20: Frontend workspace permission context + API client

**Files:**
- Create: `apps/web/src/lib/workspace-permission.ts`
- Modify: `apps/web/src/lib/auth.ts` (add member + global-user fetchers)
- Test: `apps/web/src/lib/workspace-permission.test.ts`

**Interfaces:**
- Consumes: `apiRequest` from `api-client.ts`, `webEnv`.
- Produces:
  - Types `WorkspaceContext { workspace: { id: string; accountLogin: string } | null; role: "owner" | "admin" | "reviewer" | null; memberStatus: "active" | "suspended" | null; globalStatus: "pending" | "active" | "suspended"; isSystemAdmin: boolean; entitlements: string[] }`.
  - `getWorkspaceContext(cookie?): Promise<WorkspaceContext | null>` (GET `/api/v1/workspaces/current`).
  - Pure helpers `canManageMembers(ctx): boolean` (role owner|admin), `canManageRoles(ctx): boolean` (role owner), `canSeeSystemUsers(ctx): boolean` (isSystemAdmin), `hasEntitlement(ctx, feature): boolean`.
  - In `auth.ts`: `listWorkspaceMembers(workspaceId, cookie?)`, `suspendMember/restoreMember/removeMember/changeMemberRole/transferOwnership`, `listGlobalUsers(cookie?)`, `approveGlobalUser/suspendGlobalUser`.

- [ ] **Step 1: Write the failing test (pure helpers)**

```typescript
// apps/web/src/lib/workspace-permission.test.ts
import { describe, expect, it } from "vitest";
import {
  type WorkspaceContext,
  canManageMembers,
  canManageRoles,
  canSeeSystemUsers,
  hasEntitlement,
} from "./workspace-permission";

const base: WorkspaceContext = {
  workspace: { id: "ws1", accountLogin: "acme" },
  role: "reviewer",
  memberStatus: "active",
  globalStatus: "active",
  isSystemAdmin: false,
  entitlements: ["review_read"],
};

describe("workspace permission helpers", () => {
  it("only owner/admin manage members", () => {
    expect(canManageMembers({ ...base, role: "admin" })).toBe(true);
    expect(canManageMembers({ ...base, role: "owner" })).toBe(true);
    expect(canManageMembers(base)).toBe(false);
  });

  it("only owner manages roles", () => {
    expect(canManageRoles({ ...base, role: "owner" })).toBe(true);
    expect(canManageRoles({ ...base, role: "admin" })).toBe(false);
  });

  it("only system admin sees system users", () => {
    expect(canSeeSystemUsers({ ...base, isSystemAdmin: true })).toBe(true);
    expect(canSeeSystemUsers(base)).toBe(false);
  });

  it("checks entitlement membership", () => {
    expect(hasEntitlement(base, "review_read")).toBe(true);
    expect(hasEntitlement(base, "pr_analysis")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @folio/web test workspace-permission`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the permission module**

```typescript
// apps/web/src/lib/workspace-permission.ts
import { webEnv } from "./env";

export interface WorkspaceContext {
  workspace: { id: string; accountLogin: string } | null;
  role: "owner" | "admin" | "reviewer" | null;
  memberStatus: "active" | "suspended" | null;
  globalStatus: "pending" | "active" | "suspended";
  isSystemAdmin: boolean;
  entitlements: string[];
}

export async function getWorkspaceContext(cookie?: string): Promise<WorkspaceContext | null> {
  const res = await fetch(new URL("/api/v1/workspaces/current", webEnv.apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
  });
  if (!res.ok) {
    return null;
  }
  const payload = (await res.json()) as { success: boolean; data?: WorkspaceContext };
  return payload.success && payload.data ? payload.data : null;
}

export function canManageMembers(ctx: WorkspaceContext): boolean {
  return ctx.role === "owner" || ctx.role === "admin";
}

export function canManageRoles(ctx: WorkspaceContext): boolean {
  return ctx.role === "owner";
}

export function canSeeSystemUsers(ctx: WorkspaceContext): boolean {
  return ctx.isSystemAdmin;
}

export function hasEntitlement(ctx: WorkspaceContext, feature: string): boolean {
  return ctx.entitlements.includes(feature);
}
```

- [ ] **Step 4: Add fetchers to `auth.ts`**

Append these to `apps/web/src/lib/auth.ts` (mirror the existing `getPendingUsers`/`approvePendingUser` fetch + envelope pattern; each throws `Error(payload.error?.message)` on failure and returns `data`):

```typescript
export interface WorkspaceMember {
  id: string;
  userId: string;
  role: "owner" | "admin" | "reviewer";
  status: "active" | "suspended";
}

export interface GlobalUser {
  id: string;
  login: string;
  avatarUrl: string;
  email: string | null;
  globalStatus: "pending" | "active" | "suspended";
  isSystemAdmin: boolean;
  createdAt: string;
}

export async function listWorkspaceMembers(
  workspaceId: string,
  cookie?: string,
): Promise<WorkspaceMember[]> {
  const res = await fetch(
    new URL(`/api/v1/workspaces/${workspaceId}/members`, webEnv.apiBaseUrl),
    { credentials: "include", headers: { accept: "application/json", ...(cookie ? { cookie } : {}) } },
  );
  if (!res.ok) return [];
  const payload = (await res.json()) as { success: boolean; data?: { members: WorkspaceMember[] } };
  return payload.success && payload.data ? payload.data.members : [];
}

async function memberAction(
  workspaceId: string,
  path: string,
  method: "POST" | "DELETE" | "PATCH",
  body?: unknown,
): Promise<void> {
  const res = await fetch(
    new URL(`/api/v1/workspaces/${workspaceId}/members/${path}`, webEnv.apiBaseUrl),
    {
      method,
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const payload = (await res.json()) as { success: boolean; error?: { message: string } };
  if (!res.ok || !payload.success) {
    throw new Error(payload.error?.message ?? "요청에 실패했습니다.");
  }
}

export const suspendMember = (ws: string, userId: string) =>
  memberAction(ws, `${userId}/suspend`, "POST");
export const restoreMember = (ws: string, userId: string) =>
  memberAction(ws, `${userId}/restore`, "POST");
export const removeMember = (ws: string, userId: string) => memberAction(ws, userId, "DELETE");
export const changeMemberRole = (ws: string, userId: string, role: string) =>
  memberAction(ws, `${userId}/role`, "PATCH", { role });
export const transferOwnership = (ws: string, userId: string) =>
  memberAction(ws, "transfer-ownership", "POST", { userId });

export async function listGlobalUsers(cookie?: string): Promise<GlobalUser[]> {
  const res = await fetch(new URL("/api/v1/admin/users", webEnv.apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
  });
  if (!res.ok) return [];
  const payload = (await res.json()) as { success: boolean; data?: { users: GlobalUser[] } };
  return payload.success && payload.data ? payload.data.users : [];
}

export async function approveGlobalUser(id: string): Promise<void> {
  const res = await fetch(new URL(`/api/v1/admin/users/${id}/approve`, webEnv.apiBaseUrl), {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const payload = (await res.json()) as { success: boolean; error?: { message: string } };
  if (!res.ok || !payload.success) {
    throw new Error(payload.error?.message ?? "승인에 실패했습니다.");
  }
}

export async function suspendGlobalUser(id: string): Promise<void> {
  const res = await fetch(new URL(`/api/v1/admin/users/${id}/suspend`, webEnv.apiBaseUrl), {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const payload = (await res.json()) as { success: boolean; error?: { message: string } };
  if (!res.ok || !payload.success) {
    throw new Error(payload.error?.message ?? "정지에 실패했습니다.");
  }
}
```

- [ ] **Step 5: Run test, then commit**

Run: `pnpm --filter @folio/web test workspace-permission`
Expected: PASS.

```bash
git add apps/web/src/lib/workspace-permission.ts apps/web/src/lib/workspace-permission.test.ts apps/web/src/lib/auth.ts
git commit -m "feat(web): add workspace permission context and RBAC API client"
```

---

## Task 21: Workspace members settings section

**Files:**
- Create: `apps/web/src/components/settings/workspace-members-admin.tsx`
- Modify: `apps/web/src/app/settings/workspaces/page.tsx`

**Interfaces:**
- Consumes: `getWorkspaceContext`, `canManageMembers`, `canManageRoles`, `listWorkspaceMembers`, member action fetchers.
- Produces: `WorkspaceMembersAdmin({ workspaceId, canManageRoles, initialMembers })` client component. A `SettingsCard` titled "워크스페이스 멤버" rendered only when `canManageMembers(ctx)` is true.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/settings/workspace-members-admin.tsx
"use client";

import { ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  type WorkspaceMember,
  changeMemberRole,
  removeMember,
  restoreMember,
  suspendMember,
  transferOwnership,
} from "@/lib/auth";

export function WorkspaceMembersAdmin({
  workspaceId,
  canManageRoles,
  initialMembers,
}: {
  workspaceId: string;
  canManageRoles: boolean;
  initialMembers: WorkspaceMember[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const run = (fn: () => Promise<void>, apply: (m: WorkspaceMember[]) => WorkspaceMember[]) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setMembers(apply);
      } catch (err) {
        setError(err instanceof Error ? err.message : "요청에 실패했습니다.");
      }
    });
  };

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2.5">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground/90">{m.userId}</div>
              <div className="mt-0.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
                {m.role} · {m.status}
              </div>
            </div>
            {m.role === "reviewer" ? (
              m.status === "active" ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    run(
                      () => suspendMember(workspaceId, m.userId),
                      (list) =>
                        list.map((x) => (x.id === m.id ? { ...x, status: "suspended" } : x)),
                    )
                  }
                >
                  정지
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() =>
                    run(
                      () => restoreMember(workspaceId, m.userId),
                      (list) => list.map((x) => (x.id === m.id ? { ...x, status: "active" } : x)),
                    )
                  }
                >
                  복구
                </Button>
              )
            ) : null}
            {canManageRoles && m.role === "reviewer" ? (
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  run(
                    () => changeMemberRole(workspaceId, m.userId, "admin"),
                    (list) => list.map((x) => (x.id === m.id ? { ...x, role: "admin" } : x)),
                  )
                }
              >
                admin 승격
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Wire into the workspaces settings page**

In `apps/web/src/app/settings/workspaces/page.tsx`, load the context and members server-side and render the card only for managers:

```tsx
  const ctx = await getWorkspaceContext(cookieHeader);
  const members =
    ctx?.workspace && canManageMembers(ctx)
      ? await listWorkspaceMembers(ctx.workspace.id, cookieHeader)
      : [];
```
```tsx
        {ctx?.workspace && canManageMembers(ctx) ? (
          <SettingsCard
            title="워크스페이스 멤버"
            description="리뷰어 정지·복구 및 역할 관리 (백엔드가 최종 권한을 강제합니다)."
            icon={<Users className="size-4" />}
          >
            <WorkspaceMembersAdmin
              workspaceId={ctx.workspace.id}
              canManageRoles={canManageRoles(ctx)}
              initialMembers={members}
            />
          </SettingsCard>
        ) : null}
```
(Import `getWorkspaceContext`, `canManageMembers`, `canManageRoles` from `@/lib/workspace-permission`, `listWorkspaceMembers` from `@/lib/auth`, `WorkspaceMembersAdmin`, and `Users` from `lucide-react`.)

- [ ] **Step 3: Verify build + route test**

Run: `pnpm --filter @folio/web test settings-routes` and `pnpm --filter @folio/web build`
Expected: PASS / successful build.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/settings/workspace-members-admin.tsx apps/web/src/app/settings/workspaces/page.tsx
git commit -m "feat(web): add workspace member management section"
```

---

## Task 22: System users settings section

**Files:**
- Create: `apps/web/src/components/settings/system-users-admin.tsx`
- Modify: the settings page currently rendering `PendingUsersAdmin` (find with `grep -rl PendingUsersAdmin apps/web/src`)
- Remove usage of: `apps/web/src/components/pending-users-admin.tsx` (superseded; delete once no importers remain)

**Interfaces:**
- Consumes: `getWorkspaceContext`, `canSeeSystemUsers`, `listGlobalUsers`, `approveGlobalUser`, `suspendGlobalUser`.
- Produces: `SystemUsersAdmin({ initialUsers })` client component showing every global user with approve (pending) and suspend (active) actions, rendered in a `SettingsCard` only when `canSeeSystemUsers(ctx)`.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/settings/system-users-admin.tsx
"use client";

import { Ban, Check } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { type GlobalUser, approveGlobalUser, suspendGlobalUser } from "@/lib/auth";

export function SystemUsersAdmin({ initialUsers }: { initialUsers: GlobalUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const setStatus = (id: string, status: GlobalUser["globalStatus"]) =>
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, globalStatus: status } : u)));

  const run = (fn: () => Promise<void>, id: string, status: GlobalUser["globalStatus"]) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setStatus(id, status);
      } catch (err) {
        setError(err instanceof Error ? err.message : "요청에 실패했습니다.");
      }
    });
  };

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 py-2.5">
            <img
              src={u.avatarUrl}
              alt={u.login}
              width={32}
              height={32}
              referrerPolicy="no-referrer"
              className="size-8 shrink-0 rounded-full border"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground/90">{u.login}</div>
              <div className="mt-0.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
                {u.globalStatus}
                {u.isSystemAdmin ? " · system_admin" : ""}
              </div>
            </div>
            {u.globalStatus === "pending" ? (
              <Button size="xs" onClick={() => run(() => approveGlobalUser(u.id), u.id, "active")}>
                <Check className="size-4" />
                승인
              </Button>
            ) : u.globalStatus === "active" && !u.isSystemAdmin ? (
              <Button
                size="xs"
                variant="outline"
                onClick={() => run(() => suspendGlobalUser(u.id), u.id, "suspended")}
              >
                <Ban className="size-4" />
                정지
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Swap the page usage**

In the page that renders `PendingUsersAdmin`, replace the import and usage with a server-side context gate:

```tsx
  const ctx = await getWorkspaceContext(cookieHeader);
  const systemUsers = ctx && canSeeSystemUsers(ctx) ? await listGlobalUsers(cookieHeader) : [];
```
```tsx
        {ctx && canSeeSystemUsers(ctx) ? (
          <SettingsCard title="시스템 사용자" description="전역 사용자 승인 및 정지" icon={<ShieldAlert className="size-4" />}>
            <SystemUsersAdmin initialUsers={systemUsers} />
          </SettingsCard>
        ) : null}
```
Then delete `apps/web/src/components/pending-users-admin.tsx` and the now-unused `getPendingUsers`/`approvePendingUser`/`PendingUser` exports from `auth.ts` (grep to confirm no other importers first).

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @folio/web build`
Expected: successful build with no unresolved imports.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/settings/system-users-admin.tsx apps/web/src/app apps/web/src/lib/auth.ts
git rm apps/web/src/components/pending-users-admin.tsx
git commit -m "feat(web): replace pending-users admin with system users section"
```

---

## Task 23: Entitlement + role gating on repository activation UI

**Files:**
- Modify: `apps/web/src/components/repository-toggle-form.tsx`
- Modify: `apps/web/src/app/settings/repositories/page.tsx`

**Interfaces:**
- Consumes: `getWorkspaceContext`, `canManageMembers` (repo admin gate maps to workspace admin), `hasEntitlement`.
- Produces: `RepositoryToggleForm` accepts a `disabled?: boolean` prop; when disabled it renders the button disabled with a title explaining why (insufficient role or entitlement). The repositories page computes `disabled` from the workspace context.

- [ ] **Step 1: Add the disabled affordance to the toggle**

Add `disabled` to the props and the `Button`:

```tsx
export function RepositoryToggleForm({
  repositoryId,
  repositoryName,
  enabled,
  disabled = false,
}: {
  repositoryId: string;
  repositoryName: string;
  enabled: boolean;
  disabled?: boolean;
}) {
  return (
    <form action={toggleRepositoryEnabled}>
      <input type="hidden" name="repositoryId" value={repositoryId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <Button
        size="xs"
        variant={enabled ? "secondary" : "outline"}
        disabled={disabled}
        title={disabled ? "이 작업에는 관리자 권한 또는 활성화된 플랜이 필요합니다." : undefined}
        aria-label={enabled ? `Disable ${repositoryName}` : `Enable ${repositoryName}`}
        className="font-mono text-[0.7rem] uppercase tracking-[0.12em]"
      >
        {enabled ? (
          <CheckCircle2 className="size-3.5 text-primary" />
        ) : (
          <CircleOff className="size-3.5 text-muted-foreground" />
        )}
        {enabled ? "On" : "Off"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Compute the gate in the repositories page**

In `apps/web/src/app/settings/repositories/page.tsx`, load the context and pass `disabled` to each toggle:

```tsx
  const ctx = await getWorkspaceContext(cookieHeader);
  const canActivate =
    !!ctx && canManageMembers(ctx) && hasEntitlement(ctx, "repo_activation");
```
```tsx
          <RepositoryToggleForm
            repositoryId={repo.id}
            repositoryName={repo.fullName}
            enabled={repo.folioEnabled}
            disabled={!canActivate}
          />
```
(Import `getWorkspaceContext`, `canManageMembers`, `hasEntitlement`. With `AlwaysEntitledService`, `hasEntitlement` is true for active users, so behavior only tightens on role — matching the spec's "no visible change from entitlement yet".)

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @folio/web build`
Expected: successful build.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/repository-toggle-form.tsx apps/web/src/app/settings/repositories/page.tsx
git commit -m "feat(web): gate repository activation by role and entitlement"
```

---

## Task 24: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: no errors. Fix any `max-lines` violations by splitting files (never disable the rule).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no type errors across all packages.

- [ ] **Step 3: Test**

Run: `pnpm test`
Expected: all suites PASS. DB e2e suites SKIP without `SUPABASE_DATABASE_URL`; run them against a scratch DB (`SUPABASE_DATABASE_URL=... pnpm --filter @folio/db test`) as part of the migration gate before deploy.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: all packages/apps build successfully.

- [ ] **Step 5: Manual smoke (dev profile)**

Boot backend + web in dev. Confirm: dev login lands as `active`; `/settings/workspaces` shows the members card for an owner/admin; `/settings/repositories` toggles work for a manager; a reviewer session sees neither the members card nor the system-users card. Record results before declaring done (use the `verify` skill).

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "chore: verification fixes for RBAC authorization"
```

---

## Self-Review Notes

- **Spec coverage:** Data model → Tasks 1–7; backend policy/guards → Tasks 8–15; APIs → Tasks 16–19; frontend → Tasks 20–23; testing/verification → each task's TDD steps + Task 24. Three axes (GitHub/role/entitlement) enforced in Tasks 11/12/14 and combined in Task 19.
- **Deferred details flagged inline (not placeholders):** the `POST /workspaces/claim` installer-identity wiring (Task 18) and action-specific entitlement decorators on all pull read/state/comment routes (Task 19 Step 4) depend on the OAuth identity thread from Task 15; both are called out with concrete fallbacks rather than left vague.
- **Constraint gates:** DB migration review after every generate; backfill before NOT-NULL tightening (Task 7); single-owner and single-system-admin enforced by partial unique indexes (Tasks 3, 5).

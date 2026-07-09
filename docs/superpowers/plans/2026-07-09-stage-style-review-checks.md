# Stage-Style Review Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Folio's PR review screen behave like the provided StageReview reference, with per-file viewed checks/collapse and per-chapter review-question checks/collapse.

**Architecture:** Reuse existing `file_review_state` for file checks, add a new key-change review-state table for checklist questions, expose both through the review read model, then render a split review surface with file diff panels on the left and chapter context/checklist/files on the right. Keep the existing manual GitHub inline comment API unchanged.

**Tech Stack:** pnpm monorepo, TypeScript ESM, NestJS backend, Drizzle/Postgres schema, Next.js App Router frontend, Vitest, oxlint/oxfmt, lucide-react.

## Global Constraints

- Folio is dark-mode only and must follow `docs/design-system.md`.
- Use existing OKLCH tokens from `apps/web/src/app/globals.css`; do not add raw colors in components.
- API calls in the web app go through `apps/web/src/lib/api-client.ts`.
- Backend code follows `apps/backend/src` layers: interfaces, application, domain, infrastructure.
- All API responses must use the common response envelope behavior already configured by the backend.
- Do not auto-submit GitHub review comments.
- Do not clone every StageReview control in the first pass.
- Do not redesign the dashboard or PR header beyond controls needed for this workflow.
- Do not treat checking a file as checking every review question.
- Before preparing changes for push, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

---

## File Structure

- `packages/db/src/schema/review-state.ts`: add `keyChangeReviewState`.
- `packages/db/src/repos/review-state.ts`: add key-change mark/unmark/list methods and file progress.
- `packages/db/drizzle/0005_key_change_review_state.sql`: migration for the new table.
- `packages/db/src/schema/index.ts`: continue exporting `review-state.ts`; no new barrel is needed if the table stays in that file.
- `packages/db/test/review-state.e2e.test.ts`: cover key-change state and file progress.
- `apps/backend/src/domain/review/review-read-model.ts`: add `ReviewKeyChange` and `viewed` on files.
- `apps/backend/src/application/review/review-read.facade.ts`: include file viewed state and key-change viewed state.
- `apps/backend/src/application/review/review-state.facade.ts`: add file viewed and key-change viewed use cases.
- `apps/backend/src/interfaces/api/pulls/pulls.controller.ts`: add file/key-change viewed endpoints.
- `apps/backend/src/application/review/review-read.facade.test.ts`: cover new read payload fields.
- `apps/backend/src/interfaces/api/pulls/pulls.controller.test.ts`: cover new controller methods.
- `packages/decomposition/src/prompt.ts`: strengthen `keyChanges` generation instructions.
- `packages/decomposition/src/__tests__/tool.test.ts`: keep schema assertions aligned with checklist behavior.
- `apps/web/src/lib/review-api.ts`: add new types and client functions.
- `apps/web/src/components/review/review-file-state.ts`: create pure helpers for file progress and line grouping.
- `apps/web/src/components/review/review-file-state.test.ts`: test helper behavior.
- `apps/web/src/components/review/diff-viewer.tsx`: support file-panel rendering, file viewed checks, and collapse.
- `apps/web/src/components/review/chapter-panel.tsx`: render checklist items and viewed file tree state.
- `apps/web/src/components/review/review-view.tsx`: wire stage-style drill-in layout and progress labels.

---

### Task 1: DB Review State

**Files:**
- Modify: `packages/db/src/schema/review-state.ts`
- Modify: `packages/db/src/repos/review-state.ts`
- Create: `packages/db/drizzle/0005_key_change_review_state.sql`
- Test: `packages/db/test/review-state.e2e.test.ts`

**Interfaces:**
- Produces:
  - `keyChangeReviewState` table.
  - `reviewStateRepo.markKeyChangeViewed({ userId, chapterId, keyChangeId })`.
  - `reviewStateRepo.unmarkKeyChangeViewed({ userId, chapterId, keyChangeId })`.
  - `reviewStateRepo.keyChangesViewedForChapters(userId, chapterIds)`.
  - `reviewStateRepo.fileProgressForRevision(userId, revisionId, filePaths)`.

- [ ] **Step 1: Write failing DB tests**

Append these tests inside `packages/db/test/review-state.e2e.test.ts`:

```ts
  it("marks key changes viewed idempotently", async () => {
    const [chapter] = await chaptersRepo.replaceForRevision(
      base.revisionId,
      [makeChapter(base, "c1", "1")],
      db,
    );
    const chapterId = nonNull(chapter).id;

    await reviewStateRepo.markKeyChangeViewed(
      { userId: base.userId, chapterId, keyChangeId: "chapter-1-kc-1" },
      db,
    );
    await reviewStateRepo.markKeyChangeViewed(
      { userId: base.userId, chapterId, keyChangeId: "chapter-1-kc-1" },
      db,
    );

    const viewed = await reviewStateRepo.keyChangesViewedForChapters(
      base.userId,
      [chapterId],
      db,
    );
    expect(viewed.get(chapterId)).toEqual(new Set(["chapter-1-kc-1"]));
  });

  it("unmarks key changes", async () => {
    const [chapter] = await chaptersRepo.replaceForRevision(
      base.revisionId,
      [makeChapter(base, "c1", "1")],
      db,
    );
    const chapterId = nonNull(chapter).id;
    const payload = { userId: base.userId, chapterId, keyChangeId: "chapter-1-kc-1" };

    await reviewStateRepo.markKeyChangeViewed(payload, db);
    await reviewStateRepo.unmarkKeyChangeViewed(payload, db);

    const viewed = await reviewStateRepo.keyChangesViewedForChapters(
      base.userId,
      [chapterId],
      db,
    );
    expect(viewed.get(chapterId)).toBeUndefined();
  });

  it("counts file progress against the current review files", async () => {
    await reviewStateRepo.markFileViewed(
      { userId: base.userId, revisionId: base.revisionId, filePath: "src/a.ts" },
      db,
    );

    const progress = await reviewStateRepo.fileProgressForRevision(
      base.userId,
      base.revisionId,
      ["src/a.ts", "src/b.ts"],
      db,
    );

    expect(progress).toEqual({ viewed: 1, total: 2 });
  });
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run packages/db/test/review-state.e2e.test.ts`

Expected: FAIL because `markKeyChangeViewed`, `unmarkKeyChangeViewed`, `keyChangesViewedForChapters`, and `fileProgressForRevision` do not exist.

- [ ] **Step 3: Add schema and migration**

In `packages/db/src/schema/review-state.ts`, import nothing new and add after `chapterReviewState`:

```ts
/**
 * Per-key-change "checked" state, keyed by (user, chapter, keyChangeId).
 * Key changes live in chapter jsonb, so keyChangeId stays text instead of a FK.
 */
export const keyChangeReviewState = pgTable(
  "key_change_review_state",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    keyChangeId: text("key_change_id").notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("key_change_review_state_user_chapter_key_unique").on(
      table.userId,
      table.chapterId,
      table.keyChangeId,
    ),
  ],
);

export type KeyChangeReviewStateRow = typeof keyChangeReviewState.$inferSelect;
export type KeyChangeReviewStateInsert = typeof keyChangeReviewState.$inferInsert;
```

Create `packages/db/drizzle/0005_key_change_review_state.sql`:

```sql
CREATE TABLE "key_change_review_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid NOT NULL,
  "chapter_id" uuid NOT NULL,
  "key_change_id" text NOT NULL,
  "viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "key_change_review_state"
  ADD CONSTRAINT "key_change_review_state_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "key_change_review_state"
  ADD CONSTRAINT "key_change_review_state_chapter_id_chapters_id_fk"
  FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "key_change_review_state_user_chapter_key_unique"
  ON "key_change_review_state" USING btree ("user_id", "chapter_id", "key_change_id");
```

- [ ] **Step 4: Add repo methods**

In `packages/db/src/repos/review-state.ts`, add `keyChangeReviewState` to the schema import and add methods inside `reviewStateRepo`:

```ts
  async markKeyChangeViewed(
    p: { userId: string; chapterId: string; keyChangeId: string },
    db: Db = getDb(),
  ): Promise<void> {
    await db
      .insert(keyChangeReviewState)
      .values({ userId: p.userId, chapterId: p.chapterId, keyChangeId: p.keyChangeId })
      .onConflictDoUpdate({
        target: [
          keyChangeReviewState.userId,
          keyChangeReviewState.chapterId,
          keyChangeReviewState.keyChangeId,
        ],
        set: { viewedAt: new Date(), updatedAt: new Date() },
      });
  },

  async unmarkKeyChangeViewed(
    p: { userId: string; chapterId: string; keyChangeId: string },
    db: Db = getDb(),
  ): Promise<void> {
    await db
      .delete(keyChangeReviewState)
      .where(
        and(
          eq(keyChangeReviewState.userId, p.userId),
          eq(keyChangeReviewState.chapterId, p.chapterId),
          eq(keyChangeReviewState.keyChangeId, p.keyChangeId),
        ),
      );
  },

  async keyChangesViewedForChapters(
    userId: string,
    chapterIds: string[],
    db: Db = getDb(),
  ): Promise<Map<string, Set<string>>> {
    if (chapterIds.length === 0) {
      return new Map();
    }
    const rows = await db
      .select({
        chapterId: keyChangeReviewState.chapterId,
        keyChangeId: keyChangeReviewState.keyChangeId,
      })
      .from(keyChangeReviewState)
      .where(
        and(
          eq(keyChangeReviewState.userId, userId),
          sql`${keyChangeReviewState.chapterId} = any(${chapterIds})`,
        ),
      );
    const byChapter = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = byChapter.get(row.chapterId) ?? new Set<string>();
      set.add(row.keyChangeId);
      byChapter.set(row.chapterId, set);
    }
    return byChapter;
  },

  async fileProgressForRevision(
    userId: string,
    revisionId: string,
    filePaths: string[],
    db: Db = getDb(),
  ): Promise<{ viewed: number; total: number }> {
    const viewed = await this.viewedForRevision(userId, revisionId, db);
    const visible = new Set(filePaths);
    return {
      viewed: viewed.filePaths.filter((path) => visible.has(path)).length,
      total: visible.size,
    };
  },
```

If the `any(${chapterIds})` SQL binding fails under Drizzle/Postgres, replace that `where` clause with:

```ts
where(
  and(
    eq(keyChangeReviewState.userId, userId),
    sql`${keyChangeReviewState.chapterId} in ${chapterIds}`,
  ),
);
```

- [ ] **Step 5: Run DB tests**

Run: `pnpm vitest run packages/db/test/review-state.e2e.test.ts`

Expected: PASS locally when test DB is available; SKIP is acceptable only if `HAS_DB` disables the e2e suite.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/review-state.ts packages/db/src/repos/review-state.ts packages/db/drizzle/0005_key_change_review_state.sql packages/db/test/review-state.e2e.test.ts
git commit -m "feat(db): track review checklist state"
```

---

### Task 2: Backend Read Model and Review-State APIs

**Files:**
- Modify: `apps/backend/src/domain/review/review-read-model.ts`
- Modify: `apps/backend/src/application/review/review-read.facade.ts`
- Modify: `apps/backend/src/application/review/review-state.facade.ts`
- Modify: `apps/backend/src/interfaces/api/pulls/pulls.controller.ts`
- Test: `apps/backend/src/application/review/review-read.facade.test.ts`
- Test: `apps/backend/src/interfaces/api/pulls/pulls.controller.test.ts`

**Interfaces:**
- Consumes Task 1 repo methods.
- Produces:
  - `ReviewChapterFile.viewed`.
  - `ReviewChapter.keyChanges`.
  - `ReviewStateFacade.setFileViewed(input)`.
  - `ReviewStateFacade.setKeyChangeViewed(input)`.
  - `PullsController.setFileViewed(...)`.
  - `PullsController.setKeyChangeViewed(...)`.

- [ ] **Step 1: Write read-model test expectation**

In `apps/backend/src/application/review/review-read.facade.test.ts`, update the mocked chapter:

```ts
      {
        id: "ch1",
        title: "C1",
        summary: "s",
        order: "0|a:",
        hunkRefs: [{ filePath: "a.ts", oldStart: 1 }],
        keyChanges: [
          {
            id: "chapter-1-kc-1",
            externalId: "chapter-1-kc-1",
            content: "이 변경이 API 계약을 깨지 않는지 확인해야 할까요?",
            lineRefs: [{ filePath: "a.ts", side: "additions", startLine: 2, endLine: 2 }],
          },
        ],
      },
```

Update mocked `reviewStateRepo`:

```ts
  reviewStateRepo: {
    viewedForRevision: vi.fn(async () => ({ filePaths: ["a.ts"], chapterIds: ["ch1"] })),
    keyChangesViewedForChapters: vi.fn(async () => new Map([["ch1", new Set(["chapter-1-kc-1"])]])),
  },
```

Add expectations:

```ts
    expect(payload!.chapters[0]!.files[0]).toMatchObject({ path: "a.ts", viewed: true });
    expect(payload!.chapters[0]!.keyChanges).toEqual([
      {
        id: "chapter-1-kc-1",
        content: "이 변경이 API 계약을 깨지 않는지 확인해야 할까요?",
        lineRefs: [{ filePath: "a.ts", side: "additions", startLine: 2, endLine: 2 }],
        viewed: true,
      },
    ]);
```

- [ ] **Step 2: Write controller tests**

In `apps/backend/src/interfaces/api/pulls/pulls.controller.test.ts`, extend `buildController` overrides:

```ts
  setFileViewed?: ReturnType<typeof vi.fn>;
  setKeyChangeViewed?: ReturnType<typeof vi.fn>;
```

Provide those methods in the `ReviewStateFacade` provider:

```ts
        useValue: {
          setChapterViewed: overrides.setChapterViewed ?? vi.fn(),
          setFileViewed: overrides.setFileViewed ?? vi.fn(),
          setKeyChangeViewed: overrides.setKeyChangeViewed ?? vi.fn(),
        },
```

Add tests:

```ts
  it("PATCH toggles a file's viewed mark and returns file progress", async () => {
    const setFileViewed = vi.fn(async () => ({
      path: "src/a.ts",
      viewed: true,
      progress: { viewed: 1, total: 2 },
    }));
    const controller = await buildController({ setFileViewed });

    const result = await controller.setFileViewed(
      "acme",
      "widget",
      "7",
      { path: " src/a.ts ", viewed: true },
      user,
    );

    expect(setFileViewed).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widget",
      number: 7,
      path: "src/a.ts",
      viewed: true,
      userId: "u1",
    });
    expect(result.progress).toEqual({ viewed: 1, total: 2 });
  });

  it("PATCH toggles a key-change viewed mark", async () => {
    const setKeyChangeViewed = vi.fn(async () => ({
      id: "chapter-1-kc-1",
      viewed: true,
    }));
    const controller = await buildController({ setKeyChangeViewed });

    const result = await controller.setKeyChangeViewed(
      "acme",
      "widget",
      "7",
      "1",
      "chapter-1-kc-1",
      { viewed: true },
      user,
    );

    expect(setKeyChangeViewed).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widget",
      number: 7,
      index: 1,
      keyChangeId: "chapter-1-kc-1",
      viewed: true,
      userId: "u1",
    });
    expect(result).toEqual({ id: "chapter-1-kc-1", viewed: true });
  });
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `pnpm vitest run apps/backend/src/application/review/review-read.facade.test.ts apps/backend/src/interfaces/api/pulls/pulls.controller.test.ts`

Expected: FAIL because new fields and methods do not exist.

- [ ] **Step 4: Extend backend read model**

In `apps/backend/src/domain/review/review-read-model.ts`, add:

```ts
import type { LineRef } from "@folio/types";
```

Change `WebChapterFile` and add `ReviewKeyChange`:

```ts
export interface WebChapterFile {
  path: string;
  additions: number;
  deletions: number;
  viewed: boolean;
}

export interface ReviewKeyChange {
  id: string;
  content: string;
  lineRefs: LineRef[];
  viewed: boolean;
}
```

Add `keyChanges` to `ReviewChapter`:

```ts
  keyChanges: ReviewKeyChange[];
```

- [ ] **Step 5: Extend `ReviewReadFacade`**

In `apps/backend/src/application/review/review-read.facade.ts`, after `viewedForRevision`:

```ts
    const viewedFilePaths = new Set(viewed.filePaths);
    const keyChangesByChapter = await reviewStateRepo.keyChangesViewedForChapters(
      userId,
      rows.map((row) => row.id),
    );
```

Then map files/key changes:

```ts
      const viewedKeyChanges = keyChangesByChapter.get(row.id) ?? new Set<string>();
      return {
        index: i + 1,
        title: row.title,
        summary: row.summary,
        files: code.files.map((file) => ({
          ...file,
          viewed: viewedFilePaths.has(file.path),
        })),
        diffLines: code.diffLines,
        keyChanges: (row.keyChanges ?? []).map((keyChange) => ({
          id: keyChange.id,
          content: keyChange.content,
          lineRefs: keyChange.lineRefs,
          viewed: viewedKeyChanges.has(keyChange.id),
        })),
        viewed: viewedIds.has(row.id),
      };
```

- [ ] **Step 6: Extend `ReviewStateFacade`**

Add interfaces:

```ts
export interface SetFileViewedInput {
  owner: string;
  repo: string;
  number: number;
  path: string;
  viewed: boolean;
  userId: string;
}

export interface FileViewedResult {
  path: string;
  viewed: boolean;
  progress: { viewed: number; total: number };
}

export interface SetKeyChangeViewedInput {
  owner: string;
  repo: string;
  number: number;
  index: number;
  keyChangeId: string;
  viewed: boolean;
  userId: string;
}

export interface KeyChangeViewedResult {
  id: string;
  viewed: boolean;
}
```

Add methods:

```ts
  async setFileViewed(input: SetFileViewedInput): Promise<FileViewedResult | null> {
    const repository = await repositoriesRepo.getByFullName(`${input.owner}/${input.repo}`);
    if (!repository) return null;
    const pr = await pullRequestsRepo.getByRepoAndNumber(repository.id, input.number);
    if (!pr) return null;
    const revision = await revisionsRepo.latestForPr(pr.id);
    if (!revision) return null;
    const rows = await chaptersRepo.listByRevision(revision.id);
    const filePaths = [...new Set(rows.flatMap((row) => row.hunkRefs.map((ref) => ref.filePath)))];
    if (!filePaths.includes(input.path)) return null;

    await (input.viewed
      ? reviewStateRepo.markFileViewed({
          userId: input.userId,
          revisionId: revision.id,
          filePath: input.path,
        })
      : reviewStateRepo.unmarkFileViewed({
          userId: input.userId,
          revisionId: revision.id,
          filePath: input.path,
        }));

    const progress = await reviewStateRepo.fileProgressForRevision(
      input.userId,
      revision.id,
      filePaths,
    );
    return { path: input.path, viewed: input.viewed, progress };
  }

  async setKeyChangeViewed(input: SetKeyChangeViewedInput): Promise<KeyChangeViewedResult | null> {
    const repository = await repositoriesRepo.getByFullName(`${input.owner}/${input.repo}`);
    if (!repository) return null;
    const pr = await pullRequestsRepo.getByRepoAndNumber(repository.id, input.number);
    if (!pr) return null;
    const revision = await revisionsRepo.latestForPr(pr.id);
    if (!revision) return null;
    const rows = await chaptersRepo.listByRevision(revision.id);
    const chapter = rows[input.index - 1];
    if (!chapter || !chapter.keyChanges.some((keyChange) => keyChange.id === input.keyChangeId)) {
      return null;
    }

    await (input.viewed
      ? reviewStateRepo.markKeyChangeViewed({
          userId: input.userId,
          chapterId: chapter.id,
          keyChangeId: input.keyChangeId,
        })
      : reviewStateRepo.unmarkKeyChangeViewed({
          userId: input.userId,
          chapterId: chapter.id,
          keyChangeId: input.keyChangeId,
        }));

    return { id: input.keyChangeId, viewed: input.viewed };
  }
```

- [ ] **Step 7: Extend controller**

Add body interface:

```ts
interface SetFileViewedBody {
  path: string;
  viewed: boolean;
}
```

Add route methods before `createInlineComment`:

```ts
  /** Toggle a file's viewed mark for the current user; returns file progress. */
  @Patch(":owner/:repo/:number/files/viewed")
  @UseGuards(RepoAccessGuard)
  async setFileViewed(
    @Param("owner") owner: string,
    @Param("repo") repo: string,
    @Param("number", ParseIntPipe) number: string | number,
    @Body() body: SetFileViewedBody,
    @CurrentUser() user: AuthedUser,
  ) {
    const path = body.path?.trim();
    if (!path) {
      throw new BadRequestException("File path is required");
    }
    const result = await this.reviewState.setFileViewed({
      owner,
      repo,
      number: Number(number),
      path,
      viewed: body.viewed,
      userId: user.id,
    });
    if (!result) {
      throw new NotFoundException(`No file ${path} for ${owner}/${repo}#${number}`);
    }
    return result;
  }

  /** Toggle one generated review question for the current user. */
  @Patch(":owner/:repo/:number/chapters/:index/key-changes/:keyChangeId/viewed")
  @UseGuards(RepoAccessGuard)
  async setKeyChangeViewed(
    @Param("owner") owner: string,
    @Param("repo") repo: string,
    @Param("number", ParseIntPipe) number: string | number,
    @Param("index", ParseIntPipe) index: string | number,
    @Param("keyChangeId") keyChangeId: string,
    @Body() body: SetViewedBody,
    @CurrentUser() user: AuthedUser,
  ) {
    const result = await this.reviewState.setKeyChangeViewed({
      owner,
      repo,
      number: Number(number),
      index: Number(index),
      keyChangeId,
      viewed: body.viewed,
      userId: user.id,
    });
    if (!result) {
      throw new NotFoundException(`No review question ${keyChangeId} for ${owner}/${repo}#${number}`);
    }
    return result;
  }
```

- [ ] **Step 8: Run backend tests**

Run: `pnpm vitest run apps/backend/src/application/review/review-read.facade.test.ts apps/backend/src/interfaces/api/pulls/pulls.controller.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/domain/review/review-read-model.ts apps/backend/src/application/review/review-read.facade.ts apps/backend/src/application/review/review-state.facade.ts apps/backend/src/interfaces/api/pulls/pulls.controller.ts apps/backend/src/application/review/review-read.facade.test.ts apps/backend/src/interfaces/api/pulls/pulls.controller.test.ts
git commit -m "feat(review): expose file and checklist state"
```

---

### Task 3: Decomposition Review-Question Policy

**Files:**
- Modify: `packages/decomposition/src/prompt.ts`
- Modify: `packages/decomposition/src/__tests__/tool.test.ts`

**Interfaces:**
- Produces stronger `keyChanges` prompt policy consumed by existing `emit_chapters` output.

- [ ] **Step 1: Add prompt test**

In `packages/decomposition/src/__tests__/tool.test.ts`, add:

```ts
import { SYSTEM_PROMPT } from "../prompt.js";
```

Add test:

```ts
  it("instructs the model to produce reviewable checklist questions", () => {
    expect(SYSTEM_PROMPT).toContain("For every reviewable implementation chapter");
    expect(SYSTEM_PROMPT).toContain("1-3 keyChanges");
    expect(SYSTEM_PROMPT).toContain("docs-only, generated-only, dependency-only");
    expect(SYSTEM_PROMPT).toContain("lineRefs");
  });
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm vitest run packages/decomposition/src/__tests__/tool.test.ts`

Expected: FAIL because the prompt text has not been strengthened.

- [ ] **Step 3: Update prompt**

In `packages/decomposition/src/prompt.ts`, replace the `KEY CHANGES (per Stage):` block with:

```ts
KEY CHANGES (per Stage):
- These become the right-side "검토할 사항" checklist in Folio's review UI.
- For every reviewable implementation chapter, produce 1-3 keyChanges.
- Return an EMPTY array only for docs-only, generated-only, dependency-only, or catch-all "Other changes" chapters.
- ONLY judgment-call QUESTIONS a human reviewer must answer after inspecting the chapter. Skip anything a linter, type checker, or CI catches.
- Focus questions on product behavior, correctness risk, concurrency, persistence, API contracts, security, performance, or test coverage.
- Frame each as a concise Korean question that can fit in a narrow right-side panel.
- Each question needs >=1 lineRef pointing to the strongest supporting diff line.
- lineRefs read line numbers from the formatted columns: side "deletions" → LEFT (old) column; side "additions" → RIGHT (new) column. Read the numbers; never count lines. Keep ranges tight; startLine and endLine are positive integers with endLine >= startLine.
```

- [ ] **Step 4: Run decomposition test**

Run: `pnpm vitest run packages/decomposition/src/__tests__/tool.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/decomposition/src/prompt.ts packages/decomposition/src/__tests__/tool.test.ts
git commit -m "feat(decomposition): strengthen review checklist prompts"
```

---

### Task 4: Frontend Types, Client Functions, and Pure State Helpers

**Files:**
- Modify: `apps/web/src/lib/review-api.ts`
- Create: `apps/web/src/components/review/review-file-state.ts`
- Test: `apps/web/src/components/review/review-file-state.test.ts`
- Modify: `apps/web/src/components/review/chapter-file-diff.test.ts`

**Interfaces:**
- Consumes Task 2 API payload.
- Produces:
  - `ReviewKeyChange`.
  - `setFileViewed(...)`.
  - `setKeyChangeViewed(...)`.
  - `fileProgress(files)`.
  - `groupLinesByFile(chapter)`.

- [ ] **Step 1: Update frontend type tests that construct files**

In `apps/web/src/components/review/chapter-file-diff.test.ts`, change files to include `viewed` and add `keyChanges`:

```ts
  files: [
    { path: "a.ts", additions: 1, deletions: 0, viewed: false },
    { path: "b.ts", additions: 0, deletions: 1, viewed: true },
  ],
  keyChanges: [],
```

- [ ] **Step 2: Add helper tests**

Create `apps/web/src/components/review/review-file-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ReviewChapter } from "@/lib/review-api";
import { fileProgress, groupLinesByFile } from "./review-file-state";

const chapter: ReviewChapter = {
  index: 1,
  title: "Chapter",
  summary: "Summary",
  files: [
    { path: "a.ts", additions: 2, deletions: 0, viewed: true },
    { path: "b.ts", additions: 0, deletions: 1, viewed: false },
  ],
  diffLines: [
    { path: "a.ts", n: 1, kind: "add", text: "a", newLineNumber: 1 },
    { path: "a.ts", n: 2, kind: "add", text: "b", newLineNumber: 2 },
    { path: "b.ts", n: 3, kind: "del", text: "c", oldLineNumber: 3 },
  ],
  keyChanges: [],
  viewed: false,
};

describe("review file state helpers", () => {
  it("counts viewed files", () => {
    expect(fileProgress(chapter.files)).toEqual({ viewed: 1, total: 2 });
  });

  it("groups diff lines by file in chapter file order", () => {
    expect(groupLinesByFile(chapter).map((group) => [group.file.path, group.lines.length])).toEqual([
      ["a.ts", 2],
      ["b.ts", 1],
    ]);
  });
});
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `pnpm vitest run apps/web/src/components/review/review-file-state.test.ts apps/web/src/components/review/chapter-file-diff.test.ts`

Expected: FAIL because helper file and new types do not exist.

- [ ] **Step 4: Update API types and functions**

In `apps/web/src/lib/review-api.ts`, import `LineRef` if available from `@folio/types`; otherwise define the shape locally:

```ts
export interface ReviewLineRef {
  filePath: string;
  side: "additions" | "deletions";
  startLine: number;
  endLine: number;
}
```

Change `ReviewChapterFile`:

```ts
export interface ReviewChapterFile {
  path: string;
  additions: number;
  deletions: number;
  viewed: boolean;
}
```

Add:

```ts
export interface ReviewKeyChange {
  id: string;
  content: string;
  lineRefs: ReviewLineRef[];
  viewed: boolean;
}
```

Add `keyChanges` to `ReviewChapter`:

```ts
  keyChanges: ReviewKeyChange[];
```

Add result interfaces and functions:

```ts
export interface FileViewedResult {
  path: string;
  viewed: boolean;
  progress: { viewed: number; total: number };
}

export interface KeyChangeViewedResult {
  id: string;
  viewed: boolean;
}

export function setFileViewed(
  org: string,
  repo: string,
  number: number,
  path: string,
  viewed: boolean,
): Promise<FileViewedResult> {
  return apiRequest<FileViewedResult>(`/api/v1/pulls/${org}/${repo}/${number}/files/viewed`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, viewed }),
  });
}

export function setKeyChangeViewed(
  org: string,
  repo: string,
  number: number,
  chapterIndex: number,
  keyChangeId: string,
  viewed: boolean,
): Promise<KeyChangeViewedResult> {
  return apiRequest<KeyChangeViewedResult>(
    `/api/v1/pulls/${org}/${repo}/${number}/chapters/${chapterIndex}/key-changes/${keyChangeId}/viewed`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ viewed }),
    },
  );
}
```

- [ ] **Step 5: Add helper implementation**

Create `apps/web/src/components/review/review-file-state.ts`:

```ts
import type { ReviewChapter, ReviewChapterFile, ReviewDiffLine } from "@/lib/review-api";

export interface FileDiffGroup {
  file: ReviewChapterFile;
  lines: ReviewDiffLine[];
}

export function fileProgress(files: ReviewChapterFile[]): { viewed: number; total: number } {
  return {
    viewed: files.filter((file) => file.viewed).length,
    total: files.length,
  };
}

export function groupLinesByFile(chapter: ReviewChapter): FileDiffGroup[] {
  return chapter.files.map((file) => ({
    file,
    lines: chapter.diffLines.filter((line) => line.path === file.path),
  }));
}
```

- [ ] **Step 6: Run frontend helper tests**

Run: `pnpm vitest run apps/web/src/components/review/review-file-state.test.ts apps/web/src/components/review/chapter-file-diff.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/review-api.ts apps/web/src/components/review/review-file-state.ts apps/web/src/components/review/review-file-state.test.ts apps/web/src/components/review/chapter-file-diff.test.ts
git commit -m "feat(web): add review check API helpers"
```

---

### Task 5: Stage-Style Review UI

**Files:**
- Modify: `apps/web/src/components/review/diff-viewer.tsx`
- Modify: `apps/web/src/components/review/chapter-panel.tsx`
- Modify: `apps/web/src/components/review/review-view.tsx`
- Modify: `apps/web/src/components/review/chapter-cards.tsx`

**Interfaces:**
- Consumes Task 4 API types/functions/helpers.
- Produces visible Stage-style file viewed checks, file collapse, right-panel checklist checks, and file progress labels.

- [ ] **Step 1: Convert `DiffViewer` to accept file groups and viewed updates**

Change `DiffViewer` props to accept optional file handlers:

```ts
  onFileViewedChange?: (path: string, viewed: boolean) => Promise<void>;
```

Inside `DiffViewer`, add local collapsed state:

```ts
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
```

Render one panel per `chapter.files` instead of one whole chapter table. Use `chapter.diffLines.filter((line) => line.path === file.path)` for each file. In each file header render a check button:

```tsx
<button
  type="button"
  onClick={async () => {
    const next = !file.viewed;
    if (next) {
      setCollapsedFiles((prev) => ({ ...prev, [file.path]: true }));
    }
    await onFileViewedChange?.(file.path, next);
  }}
  className={cn(
    "flex size-5 items-center justify-center rounded-full border transition-colors",
    file.viewed && "border-primary bg-primary text-primary-foreground",
  )}
  aria-pressed={file.viewed}
  aria-label={file.viewed ? `${file.path} 파일 읽음 해제` : `${file.path} 파일 읽음으로 표시`}
>
  {file.viewed ? <Check className="size-3.5" /> : null}
</button>
```

Keep the existing manual line comment editor behavior unchanged inside each file's table.

- [ ] **Step 2: Add checklist UI to `ChapterPanel`**

In `apps/web/src/components/review/chapter-panel.tsx`, import `setKeyChangeViewed` and add state:

```ts
const [keyChanges, setKeyChanges] = useState(chapter.keyChanges);
```

Render under the summary:

```tsx
<div className="border-t px-4 py-4">
  <h3 className="text-xs font-medium text-muted-foreground uppercase">검토할 사항</h3>
  <div className="mt-3 space-y-2">
    {keyChanges.length > 0 ? (
      keyChanges.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={async () => {
            const next = !item.viewed;
            setKeyChanges((prev) =>
              prev.map((keyChange) =>
                keyChange.id === item.id ? { ...keyChange, viewed: next } : keyChange,
              ),
            );
            try {
              await setKeyChangeViewed(org, repo, number, chapter.index, item.id, next);
            } catch {
              setKeyChanges((prev) =>
                prev.map((keyChange) =>
                  keyChange.id === item.id ? { ...keyChange, viewed: !next } : keyChange,
                ),
              );
            }
          }}
          className={cn(
            "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
            item.viewed
              ? "border-primary/25 bg-primary/10 text-muted-foreground line-through"
              : "border-border bg-background/35 hover:bg-accent",
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
              item.viewed && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {item.viewed ? <Check className="size-3" /> : null}
          </span>
          <span>{item.content}</span>
        </button>
      ))
    ) : (
      <p className="text-muted-foreground text-sm">검토할 사항이 없습니다.</p>
    )}
  </div>
</div>
```

Add `useEffect` to reset local key changes when `chapter.index` changes.

- [ ] **Step 3: Wire file viewed updates in `ReviewView`**

In `apps/web/src/components/review/review-view.tsx`, import `setFileViewed` and `fileProgress`. Store chapters locally:

```ts
const [reviewChapters, setReviewChapters] = useState(chapters);
```

Use `reviewChapters` instead of `chapters` for aggregate files, open chapter, cards, and file progress. Add:

```ts
async function updateFileViewed(path: string, viewed: boolean) {
  setReviewChapters((prev) =>
    prev.map((chapter) => ({
      ...chapter,
      files: chapter.files.map((file) => (file.path === path ? { ...file, viewed } : file)),
    })),
  );
  try {
    await setFileViewed(pr.org, pr.repo, pr.number, path, viewed);
  } catch {
    setReviewChapters((prev) =>
      prev.map((chapter) => ({
        ...chapter,
        files: chapter.files.map((file) => (file.path === path ? { ...file, viewed: !viewed } : file)),
      })),
    );
  }
}
```

Pass `onFileViewedChange={updateFileViewed}` to `DiffViewer`.

- [ ] **Step 4: Update tab/progress labels**

In `ReviewView`, compute:

```ts
const fileProgressValue = fileProgress(files);
```

Use label `파일이 변경됨` and display count text as `${fileProgressValue.viewed}/${fileProgressValue.total} viewed` near the files tab or toolbar.

- [ ] **Step 5: Update chapter cards metadata**

In `apps/web/src/components/review/chapter-cards.tsx`, show checklist count:

```tsx
{chapter.keyChanges.length > 0 ? (
  <span className="flex items-center gap-1 text-muted-foreground">
    <CheckCircle2 className="size-3" />
    {chapter.keyChanges.filter((item) => item.viewed).length}/{chapter.keyChanges.length}
  </span>
) : null}
```

- [ ] **Step 6: Run frontend typecheck/test**

Run: `pnpm vitest run apps/web/src/components/review/review-file-state.test.ts apps/web/src/components/review/chapter-file-diff.test.ts apps/web/src/components/review/diff-comment-target.test.ts`

Expected: PASS.

Run: `pnpm --filter @folio/web typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/review/diff-viewer.tsx apps/web/src/components/review/chapter-panel.tsx apps/web/src/components/review/review-view.tsx apps/web/src/components/review/chapter-cards.tsx
git commit -m "feat(web): add stage-style review checks"
```

---

### Task 6: Final Verification and UX Pass

**Files:**
- Modify only if verification finds a defect in files changed by Tasks 1-5.

**Interfaces:**
- Consumes all prior tasks.
- Produces verified branch ready for review.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 2: Run local app smoke check**

Start backend and web in separate terminals:

```bash
APP_PROFILE=dev pnpm dev:backend
NEXT_PUBLIC_APP_PROFILE=dev pnpm dev:web
```

Expected:

- backend listens on `8080`
- web listens on `5173`
- existing PR review page loads
- chapter overview shows checklist counts when `keyChanges` exist
- chapter drill-in shows file check buttons
- checking a file collapses its diff and updates file progress
- checking a review question collapses/de-emphasizes that item
- manual GitHub line comment button still opens the editor

- [ ] **Step 3: Inspect git status**

Run: `git status --short`

Expected: clean after all task commits.

- [ ] **Step 4: Commit verification fixes if needed**

If Step 1 or Step 2 required fixes:

```bash
git add <changed-files>
git commit -m "fix(review): polish stage-style checks"
```

Expected: only verification-driven fixes are committed.

## Self-Review Notes

- Spec coverage: Task 1 covers review-question persistence. Task 2 covers read model and APIs. Task 3 covers AI review-question generation. Task 4 covers frontend contracts. Task 5 covers Stage-style UI behavior. Task 6 covers full verification and smoke testing.
- Migration gate: Task 1 explicitly adds `0005_key_change_review_state.sql`; execution should stop for user approval if production DB migration timing is in scope.
- Type consistency: `ReviewKeyChange.id` matches persisted `KeyChange.id`; `keyChangeId` route parameter maps to the same value.
- Scope control: Display controls are kept as existing button behavior; no new display settings are added in this plan.

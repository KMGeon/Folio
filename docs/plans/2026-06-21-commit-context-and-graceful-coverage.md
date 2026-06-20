# Commit Context (②) + Graceful Coverage (④) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (②) feed PR commit messages to the decomposition LLM as a grouping hint, and (④) stop discarding good LLM chapters on minor coverage failures — sanitize instead of throwing to the deterministic fallback.

**Architecture:** ② adds `getPullRequestCommits` to `@folio/github` and wires it through the review facade into `decompose({ commits })` (the decomposition package already consumes `input.commits` in the prompt). ④ replaces the throw inside `ensureFullCoverage` with a `sanitizeChapters` pass that strips invalid/duplicate hunkRefs and sweeps missing hunks into a leftover chapter, preserving the LLM's chapter structure and narration.

**Tech Stack:** TypeScript ESM, vitest, octokit, `@folio/github` / `@folio/decomposition` / NestJS backend facade.

## Global Constraints

- 테스트 러너 vitest. 패키지별 실행: `pnpm --filter @folio/github test`, `pnpm --filter backend test`, `pnpm --filter @folio/decomposition test`. 타입체크: 각 패키지 `... typecheck`.
- 파일/모듈 명명: 모호한 이름(helpers/utils/common) 금지 — 도메인 개념으로. 주석은 "왜"만 1~2줄. `max-lines` disable 금지. pre-commit(oxlint/oxfmt) `--no-verify` 금지.
- ④의 핵심 불변식: `sanitizeChapters`는 **항상 100% 커버리지**를 보장한다(extra 제거 + duplicate 1회로 축소 + missing은 leftover로 sweep). 절대 throw하지 않는다.
- ④ 이후 `decompose()`의 try/catch는 **실제 LLM transport 에러일 때만** deterministic로 떨어진다(커버리지 near-miss는 더 이상 폴백을 유발하지 않는다).
- ②는 commit **메시지를 LLM context로** 넘기는 것까지만. commit→hunk 매핑(per-commit diff) 기반 deterministic 그룹핑은 범위 밖.
- 기존 동작 회귀 금지: github/facade/decomposition 기존 테스트 모두 green 유지.

---

## File Structure

- `packages/github/src/pull-request.ts` — **수정**: `getPullRequestCommits(client, ref): Promise<PullRequestCommit[]>` 추가.
- `packages/github/src/index.ts` — **수정**: 신규 함수 + 타입 export.
- `packages/github/src/__tests__/pull-request.test.ts` — **수정**: `getPullRequestCommits` 테스트 추가.
- `apps/backend/src/application/review/review-pull.facade.ts` — **수정**: 커밋을 가져와 `decompose({ commits })`로 전달.
- `apps/backend/src/application/review/review-pull.facade.test.ts` — **수정**: 커밋 fetch + 전달 검증(또는 회귀 무해 확인).
- `packages/decomposition/src/sanitize-coverage.ts` — **신규**: `sanitizeChapters(chapters, reviewable): ChapterEmit[]`.
- `packages/decomposition/src/decompose.ts` — **수정**: `ensureFullCoverage`가 throw 대신 `sanitizeChapters` 호출.
- `packages/decomposition/src/__tests__/sanitize-coverage.test.ts` — **신규**: sanitize 단위 테스트.
- `packages/decomposition/src/__tests__/decompose.test.ts` — **수정**: 중복/extra ref가 있어도 source가 "llm"으로 살아남는 통합 테스트.

---

## Task 1: `@folio/github`에 `getPullRequestCommits` 추가

**Files:**
- Modify: `packages/github/src/pull-request.ts`
- Modify: `packages/github/src/index.ts`
- Test: `packages/github/src/__tests__/pull-request.test.ts`

**Interfaces:**
- Produces: `interface PullRequestCommit { sha: string; message: string }` 와 `getPullRequestCommits(client: Octokit, ref: PullRequestRef): Promise<PullRequestCommit[]>`. octokit `pulls.listCommits`를 100/page 페이지네이션, `data.commit.message`에서 메시지 추출.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/github/src/__tests__/pull-request.test.ts` 상단 import에 `getPullRequestCommits`를 추가하고, fake octokit overrides에 `listCommits`를 추가한다(타입 시그니처에 `listCommits?: unknown;` 추가, `rest.pulls`에 `listCommits: overrides.listCommits ?? "listCommits-endpoint"` 추가). 그리고 테스트 블록 추가:

```typescript
describe("getPullRequestCommits", () => {
  it("paginates and maps commits onto {sha, message}", async () => {
    const paginate = vi.fn().mockResolvedValue([
      { sha: "aaa111", commit: { message: "feat: first\n\nbody" } },
      { sha: "bbb222", commit: { message: "fix: second" } },
    ]);
    const client = fakeOctokit({ paginate });
    const commits = await getPullRequestCommits(client, REF);
    expect(commits).toEqual([
      { sha: "aaa111", message: "feat: first\n\nbody" },
      { sha: "bbb222", message: "fix: second" },
    ]);
    expect(paginate).toHaveBeenCalledWith(
      "listCommits-endpoint",
      expect.objectContaining({ owner: "acme", repo: "widgets", pull_number: 5, per_page: 100 }),
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @folio/github test -- pull-request`
Expected: FAIL — `getPullRequestCommits` import 불가.

- [ ] **Step 3: pull-request.ts 구현**

`PullRequestFile` 인터페이스 아래(또는 다른 envelope 타입 근처)에 추가:

```typescript
export interface PullRequestCommit {
  sha: string;
  /** Full commit message (first line is used as a grouping hint downstream). */
  message: string;
}
```

`listPullRequestFiles` 아래에 함수 추가:

```typescript
/**
 * List a PR's commits (oldest→newest), paginating at 100/page. Commit messages
 * are a strong author-authored grouping signal for the decomposition LLM.
 */
export async function getPullRequestCommits(
  client: Octokit,
  ref: PullRequestRef,
): Promise<PullRequestCommit[]> {
  const commits = await client.paginate(client.rest.pulls.listCommits, {
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
    per_page: PER_PAGE,
  });
  return commits.map((c) => ({ sha: c.sha, message: c.commit.message }));
}
```

- [ ] **Step 4: index.ts export 추가**

`./pull-request.js` export 블록에 `getPullRequestCommits` 와 `type PullRequestCommit`를 알파벳 순서에 맞게 추가:

```typescript
export {
  getPullRequest,
  getPullRequestCommits,
  getPullRequestDiff,
  getReviewComments,
  getReviews,
  listPullRequestFiles,
  type PullRequestCommit,
  type PullRequestFile,
  type PullRequestSummary,
  type ReviewCommentSummary,
  type ReviewSummary,
} from "./pull-request.js";
```

- [ ] **Step 5: 테스트 통과 + 타입체크**

Run: `pnpm --filter @folio/github test -- pull-request` → PASS.
Run: `pnpm --filter @folio/github test` → 전체 PASS.
Run: `pnpm --filter @folio/github typecheck` → PASS.

- [ ] **Step 6: 커밋**

```bash
git add packages/github/src/pull-request.ts packages/github/src/index.ts packages/github/src/__tests__/pull-request.test.ts
git commit -m "feat(github): getPullRequestCommits 추가(분해 그룹핑 신호)"
```

---

## Task 2: facade가 commit을 decompose에 전달

**Files:**
- Modify: `apps/backend/src/application/review/review-pull.facade.ts`
- Test: `apps/backend/src/application/review/review-pull.facade.test.ts`

**Interfaces:**
- Consumes: `getPullRequestCommits` (Task 1). `decompose` input은 이미 선택적 `commits?: { sha: string; message: string }[]`를 받는다.
- Produces: facade가 commit을 가져와 `decompose`에 넘긴다.

- [ ] **Step 1: 실패하는/갱신 테스트 작성**

`review-pull.facade.test.ts`의 fake octokit(`fakeOctokit`)에 `rest.pulls`로 `listCommits` 엔드포인트와, commit을 반환하도록 `paginate`를 조정한다. 현재 `paginate: vi.fn(async () => [])`는 issue 댓글 목록(빈 배열 필요)과 commit 목록에 동시에 쓰이므로, **첫 인자로 분기**하도록 바꾼다:

```typescript
// fakeOctokit() 내부: pulls에 listCommits 추가
rest: {
  pulls: {
    get: vi.fn(/* 기존 그대로 */),
    listCommits: "listCommits-endpoint",
  },
  issues: { listComments, createComment, updateComment },
},
// paginate를 엔드포인트로 분기
paginate: vi.fn(async (endpoint: unknown) =>
  endpoint === "listCommits-endpoint"
    ? [{ sha: "c1", commit: { message: "feat: do a thing" } }]
    : [],
),
```

그리고 commit이 decompose로 흘러가는지 검증하는 테스트를 추가한다. decompose는 `decomposeDeps.clientFactory`로 주입한 stub이 받으므로, stub의 `emitChapters`가 받은 프롬프트에 commit 메시지가 들어갔는지로 확인한다:

```typescript
it("passes PR commit messages into the decomposition prompt", async () => {
  const octokit = fakeOctokit();
  let seenUserPrompt = "";
  const facade = new ReviewPullFacade({
    octokitFactory: () => octokit as never,
    persist: vi.fn(async () => ({ prId: "pr1", revisionId: "rev1", revisionIndex: 0 })),
    decomposeDeps: {
      clientFactory: () => ({
        model: "stub",
        emitChapters: async (req: { messages: { content: string }[] }) => {
          seenUserPrompt = req.messages[0]?.content ?? "";
          return {
            chapters: [
              {
                id: "chapter-1",
                order: 1,
                title: "All changes",
                summary: "x",
                hunkRefs: [{ filePath: "a.ts", oldStart: 1 }],
                keyChanges: [],
              },
            ],
          };
        },
      }),
    },
  });
  await facade.run({ owner: "acme", repo: "widget", number: 7 });
  expect(seenUserPrompt).toContain("feat: do a thing");
});
```

> 주: 이 테스트가 통과하려면 PR 진단이 LLM 경로를 타야 한다. fake diff(`@@ -1 +1,2 @@`)는 1 hunk라 tiny지만, ①(앞 작업)으로 tiny PR도 이제 LLM 경로를 타므로 stub이 호출된다. stub이 호출되지 않으면 ①이 적용됐는지 먼저 확인한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter backend test -- review-pull.facade`
Expected: FAIL — facade가 아직 commit을 안 넘겨 `seenUserPrompt`에 메시지 없음.

- [ ] **Step 3: facade 수정**

import에 `getPullRequestCommits` 추가:

```typescript
import {
  createInstallationOctokit,
  getPullRequest,
  getPullRequestCommits,
  getPullRequestDiff,
  upsertMarkedComment,
} from "@folio/github";
```

`run()`에서 diff를 가져온 뒤 commit을 가져와 decompose에 전달:

```typescript
    const summary = await getPullRequest(octokit, ref);
    const rawDiff = await getPullRequestDiff(octokit, ref);
    // Author commit messages are a strong grouping signal for the LLM.
    const commits = await getPullRequestCommits(octokit, ref);

    const { chapters, prologue } = await decompose(
      { diff: rawDiff, prTitle: summary.title, prBody: summary.body, commits },
      { model: config.FOLIO_DECOMP_MODEL },
      this.deps.decomposeDeps ?? {},
    );
```

- [ ] **Step 4: 테스트 통과 + 타입체크 + 회귀**

Run: `pnpm --filter backend test -- review-pull.facade` → PASS(신규 + 기존).
Run: `pnpm --filter backend test` → 전체 PASS.
Run: `pnpm --filter backend typecheck` → PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/backend/src/application/review/review-pull.facade.ts apps/backend/src/application/review/review-pull.facade.test.ts
git commit -m "feat(backend): PR 커밋 메시지를 분해 프롬프트로 전달"
```

---

## Task 3: ④ 커버리지 graceful degradation (`sanitizeChapters`)

**Files:**
- Create: `packages/decomposition/src/sanitize-coverage.ts`
- Modify: `packages/decomposition/src/decompose.ts`
- Test: `packages/decomposition/src/__tests__/sanitize-coverage.test.ts` (신규)
- Test: `packages/decomposition/src/__tests__/decompose.test.ts` (수정)

**Interfaces:**
- Consumes: `collectHunkRefs`(`./fallback.js`), `buildLeftoverChanges`(`./other-changes.js`), `ChapterEmit`/`PullRequestFile`(`@folio/types`).
- Produces: `sanitizeChapters(chapters: ChapterEmit[], reviewable: PullRequestFile[]): ChapterEmit[]` — 항상 100% 커버리지. `decompose.ts`의 `ensureFullCoverage`가 throw 대신 이것을 호출.

- [ ] **Step 1: 실패하는 단위 테스트 작성**

Create `packages/decomposition/src/__tests__/sanitize-coverage.test.ts`:

```typescript
import type { ChapterEmit, PullRequestFile } from "@folio/types";
import { describe, expect, it } from "vitest";
import { sanitizeChapters } from "../sanitize-coverage.js";

// Two files, each one hunk at oldStart 1 and 5.
const files: PullRequestFile[] = [
  { path: "a.ts", status: "modified", hunks: [{ oldStart: 1 }, { oldStart: 5 }] },
] as unknown as PullRequestFile[];

function ch(order: number, refs: { filePath: string; oldStart: number }[]): ChapterEmit {
  return { id: `chapter-${order}`, order, title: `c${order}`, summary: "s", hunkRefs: refs, keyChanges: [] };
}

describe("sanitizeChapters", () => {
  it("drops hunkRefs that do not exist in the diff (extra)", () => {
    const out = sanitizeChapters(
      [ch(1, [{ filePath: "a.ts", oldStart: 1 }, { filePath: "a.ts", oldStart: 99 }])],
      files,
    );
    const all = out.flatMap((c) => c.hunkRefs);
    expect(all).not.toContainEqual({ filePath: "a.ts", oldStart: 99 });
    expect(all).toContainEqual({ filePath: "a.ts", oldStart: 1 });
  });

  it("keeps a duplicated hunk in the first chapter only", () => {
    const out = sanitizeChapters(
      [ch(1, [{ filePath: "a.ts", oldStart: 1 }]), ch(2, [{ filePath: "a.ts", oldStart: 1 }, { filePath: "a.ts", oldStart: 5 }])],
      files,
    );
    const c1 = out.find((c) => c.title === "c1");
    const c2 = out.find((c) => c.title === "c2");
    expect(c1?.hunkRefs).toContainEqual({ filePath: "a.ts", oldStart: 1 });
    expect(c2?.hunkRefs).not.toContainEqual({ filePath: "a.ts", oldStart: 1 });
    expect(c2?.hunkRefs).toContainEqual({ filePath: "a.ts", oldStart: 5 });
  });

  it("drops a chapter that becomes empty and renumbers order", () => {
    const out = sanitizeChapters(
      [ch(1, [{ filePath: "a.ts", oldStart: 99 }]), ch(2, [{ filePath: "a.ts", oldStart: 1 }])],
      files,
    );
    expect(out.some((c) => c.title === "c1")).toBe(false);
    expect(out[0]?.order).toBe(1);
  });

  it("sweeps unassigned hunks into a leftover chapter (full coverage)", () => {
    const out = sanitizeChapters([ch(1, [{ filePath: "a.ts", oldStart: 1 }])], files);
    const all = out.flatMap((c) => c.hunkRefs);
    expect(all).toContainEqual({ filePath: "a.ts", oldStart: 1 });
    expect(all).toContainEqual({ filePath: "a.ts", oldStart: 5 });
  });
});
```

> 주: 위 `PullRequestFile` 픽스처의 정확한 형태(필드명 `path`/`hunks`/`oldStart`)는 `@folio/types`의 실제 정의를 따라야 한다. 구현 전에 `packages/types/src`에서 `PullRequestFile`과 hunk 타입을 확인하고, 필요한 필수 필드를 픽스처에 채운다(`as unknown as` 캐스팅으로 불필요한 필드는 생략 가능).

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @folio/decomposition test -- sanitize-coverage`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: sanitize-coverage.ts 구현**

Create `packages/decomposition/src/sanitize-coverage.ts`:

```typescript
// Graceful coverage repair. When the LLM's chapters fail hunk-coverage after the
// bounded repair loop, we keep their structure + narration instead of discarding
// everything to the deterministic fallback: drop invalid/duplicate hunkRefs and
// sweep any unassigned hunks into a leftover chapter. ALWAYS yields full coverage.

import type { ChapterEmit, HunkReference, PullRequestFile } from "@folio/types";
import { collectHunkRefs } from "./fallback.js";
import { buildLeftoverChanges } from "./other-changes.js";

function refKey(r: HunkReference): string {
  return `${r.filePath} ${r.oldStart}`;
}

export function sanitizeChapters(
  chapters: ChapterEmit[],
  reviewable: PullRequestFile[],
): ChapterEmit[] {
  const valid = new Set(collectHunkRefs(reviewable).map(refKey));
  const seen = new Set<string>();

  const kept: ChapterEmit[] = [];
  for (const chapter of chapters) {
    const refs: HunkReference[] = [];
    for (const ref of chapter.hunkRefs) {
      const key = refKey(ref);
      // Drop refs that aren't real hunks (extra) or already taken (duplicate).
      if (!valid.has(key) || seen.has(key)) {
        continue;
      }
      seen.add(key);
      refs.push(ref);
    }
    if (refs.length > 0) {
      kept.push({ ...chapter, hunkRefs: refs });
    }
  }

  // Sweep any valid hunk no chapter claimed into one leftover chapter.
  const missing = collectHunkRefs(reviewable).filter((r) => !seen.has(refKey(r)));
  const leftover = buildLeftoverChanges(missing);
  if (leftover) {
    kept.push({
      id: "",
      order: 0,
      title: leftover.title,
      summary: leftover.summary,
      hunkRefs: leftover.hunkRefs,
      keyChanges: [],
    });
  }

  // Renumber order + id sequentially after drops/additions.
  return kept.map((c, i) => ({ ...c, id: `chapter-${i + 1}`, order: i + 1 }));
}
```

> 주: `buildLeftoverChanges`의 정확한 반환 형태(`{ title, summary, hunkRefs }` 또는 다른 필드)는 `other-changes.ts`에서 확인하고 위 매핑을 맞춘다. `collectHunkRefs`와 `buildLeftoverChanges`의 시그니처가 다르면 그에 맞춰 조정한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @folio/decomposition test -- sanitize-coverage` → PASS (4 tests).

- [ ] **Step 5: `decompose.ts`의 `ensureFullCoverage` 교체**

`decompose.ts` 상단 import에 추가:

```typescript
import { sanitizeChapters } from "./sanitize-coverage.js";
```

`ensureFullCoverage` 함수 본문을 교체(throw 제거):

```typescript
function ensureFullCoverage(chapters: ChapterEmit[], reviewable: PullRequestFile[]): ChapterEmit[] {
  const report = coverageOf(reviewable, chapters);
  if (isFullyCovered(report)) {
    return chapters;
  }
  // Graceful: keep the LLM's chapters + narration; strip bad refs, sweep missing.
  // (Previously threw on extra/duplicate refs → discarded all LLM output.)
  return sanitizeChapters(chapters, reviewable);
}
```

`buildLeftoverChanges` import가 `decompose.ts`에서 더는 직접 쓰이지 않으면 제거한다(현재 `ensureFullCoverage`가 쓰던 것 — 이제 `sanitize-coverage.ts`로 이동). 단 `buildExcludedChanges`는 계속 쓰이므로 import 라인에서 `buildLeftoverChanges`만 빼고 남긴다. 미사용 import lint 에러가 나지 않게 확인.

- [ ] **Step 6: decompose 통합 테스트 추가**

`decompose.test.ts`의 LLM happy-path describe 안에 추가:

```typescript
it("keeps LLM chapters (source 'llm') when output has a duplicate hunk ref", async () => {
  const diff = readFixture("refactor-with-tests.diff");
  const base = fullCoverageChapter(diff);
  // Two chapters that BOTH claim base's first hunk → duplicate; sanitize must not fall back.
  const dupRef = base.hunkRefs[0];
  const stub = new StubClient([
    {
      chapters: [
        { ...base, id: "chapter-1", order: 1 },
        { id: "chapter-2", order: 2, title: "Dup", summary: "s", hunkRefs: [dupRef], keyChanges: [] },
      ],
    },
  ]);
  const result = await decompose({ diff }, {}, { clientFactory: () => stub });
  expect(result.source).toBe("llm");
  expectFullCoverage(diff, result.chapters);
});
```

> 주: `base.hunkRefs[0]`이 존재하도록 `refactor-with-tests.diff`가 ≥1 hunk임을 전제(앞 작업에서 4 hunk 확인됨). repair 루프가 먼저 돌아 coverage 피드백으로 고칠 수도 있으니, stub은 응답을 1개만 줘서 repair 재시도가 없도록 한다(큐 소진 후 마지막 출력이 ensureFullCoverage로 감) — 동작이 다르면 stub 응답을 2회분 동일하게 주어 repair 후에도 동일 출력이 ensureFullCoverage에 도달하게 한다.

- [ ] **Step 7: 전체 테스트 + 타입체크**

Run: `pnpm --filter @folio/decomposition test` → 전체 PASS.
Run: `pnpm --filter @folio/decomposition typecheck` → PASS.

- [ ] **Step 8: 커밋**

```bash
git add packages/decomposition/src/sanitize-coverage.ts packages/decomposition/src/decompose.ts packages/decomposition/src/__tests__/sanitize-coverage.test.ts packages/decomposition/src/__tests__/decompose.test.ts
git commit -m "feat(decomposition): 커버리지 실패 시 LLM 챕터 보존(graceful degradation)"
```

---

## Task 4: 전체 검증

**Files:** 없음 (검증 전용).

- [ ] **Step 1: 영향 패키지 검증**

```bash
pnpm --filter @folio/github typecheck && pnpm --filter @folio/github test
pnpm --filter backend typecheck && pnpm --filter backend test
pnpm --filter @folio/decomposition typecheck && pnpm --filter @folio/decomposition test && pnpm --filter @folio/decomposition build
```
Expected: 전부 통과.

> 루트 `pnpm lint`/`build`는 무관한 web WIP로 실패할 수 있다 — 위 3개 패키지가 깨끗한지만 확인한다.

- [ ] **Step 2: 커밋 없음** — 검증만.

---

## Self-Review (작성자 체크 완료)

- **Spec coverage:** ②=Task 1(github fetch)+Task 2(facade 전달, prompt가 이미 commits 렌더); ④=Task 3(sanitizeChapters로 throw 제거, 항상 full coverage). 비목표(③⑤, commit→hunk 매핑)는 구현 없음.
- **Placeholder scan:** Task 1/3의 "주(註)"는 placeholder가 아니라 실제 타입 정의(`PullRequestFile`, `buildLeftoverChanges`, `c.commit.message`)를 구현 시 확인하라는 구체 지시 + 대안. 모든 코드 단계에 실제 코드/명령 포함.
- **Type consistency:** `getPullRequestCommits(client, ref): Promise<PullRequestCommit[]>`, `PullRequestCommit { sha, message }`가 `DecompositionInput.commits {sha, message}[]`와 호환. `sanitizeChapters(chapters, reviewable): ChapterEmit[]` 시그니처가 Task 3 정의↔`decompose.ts` 소비 간 일치.

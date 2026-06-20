# tiny-PR LLM Narration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리뷰 가능한 hunk가 1개라도 있으면 작은 PR도 LLM 경로를 타게 해서, 모든 PR이 제대로 된 제목·요약·prologue를 받도록 한다.

**Architecture:** `decompose()`의 short-circuit에서 `reviewableHunks <= threshold` 조건을 제거해 tiny PR을 LLM 경로로 합류시키고, 임계값은 "단일 챕터 선호" 소프트 힌트로 재해석한다 — tiny PR일 때만 user 프롬프트에 한 줄을 추가한다. deterministic은 0 hunk / LLM off / LLM 실패 시의 순수 폴백으로만 남는다.

**Tech Stack:** TypeScript ESM, vitest, `@folio/decomposition` 패키지.

## Global Constraints

- 패키지 작업 디렉터리: `packages/decomposition`. 테스트: `pnpm --filter @folio/decomposition test` (루트에서). 타입체크: `pnpm --filter @folio/decomposition typecheck`.
- 테스트 러너는 vitest. 테스트 파일은 `src/__tests__/*.test.ts`.
- 소프트 힌트 문구는 정확히: `This PR is small (N reviewable hunks). Prefer a SINGLE chapter unless the changes are genuinely independent.` (N은 실제 hunk 수).
- 힌트는 **tiny PR(reviewableHunks ≤ singleChapterHunkThreshold, 기본 3)일 때만** 프롬프트에 들어간다. 그보다 큰 PR엔 절대 들어가지 않는다.
- deterministic 폴백 동작(0 hunk, LLM off, LLM 실패)과 `decomposeDeterministic` 시그니처는 바뀌지 않는다.
- `buildFallbackChapters`가 `singleChapterHunkThreshold`를 쓰는 용법(tiny→1챕터 폴백)은 그대로 유지.
- 파일/모듈 명명: 모호한 이름(helpers/utils/common) 금지. 주석은 "왜"만 1~2줄. `max-lines` disable 추가 금지. pre-commit 훅(oxlint/oxfmt) `--no-verify` 금지.

---

## File Structure

- `packages/decomposition/src/prompt.ts` — **수정**: `buildUserPrompt`에 선택적 `smallPrHunkCount` 인자 추가, tiny PR일 때 `## Task`에 소프트 힌트 한 줄 삽입.
- `packages/decomposition/src/decompose.ts` — **수정**: short-circuit에서 `reviewableHunks <= threshold` 제거; `runLlm`/`buildPromptFor`에 `smallPrHunkCount`를 배선.
- `packages/decomposition/src/config.ts` — **수정**: `DEFAULT_SINGLE_CHAPTER_HUNK_THRESHOLD` / `singleChapterHunkThreshold` 주석을 새 의미("LLM에 단일 챕터 선호 힌트")로 갱신.
- `packages/decomposition/src/__tests__/prompt.test.ts` — **신규**: `buildUserPrompt` 힌트 포함/미포함 단위 테스트.
- `packages/decomposition/src/__tests__/decompose.test.ts` — **수정**: 기존 tiny-PR 테스트 재작성 + 라우팅/회귀 케이스.

---

## Task 1: `buildUserPrompt`에 소프트 힌트 추가

**Files:**
- Modify: `packages/decomposition/src/prompt.ts`
- Test: `packages/decomposition/src/__tests__/prompt.test.ts` (신규)

**Interfaces:**
- Consumes: 없음.
- Produces: `buildUserPrompt(input: DecompositionInput, formattedDiff: string, smallPrHunkCount?: number): string`. `smallPrHunkCount`가 주어지면 `## Task` 블록 끝에 소프트 힌트 한 줄을 추가, 없으면 기존과 동일.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `packages/decomposition/src/__tests__/prompt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildUserPrompt } from "../prompt.js";

const HINT = "Prefer a SINGLE chapter unless the changes are genuinely independent.";

describe("buildUserPrompt — small-PR soft hint", () => {
  it("omits the hint when smallPrHunkCount is undefined", () => {
    const out = buildUserPrompt({ prTitle: "x" }, "FORMATTED_DIFF");
    expect(out).not.toContain(HINT);
    expect(out).toContain("## Task");
    expect(out).toContain("FORMATTED_DIFF");
  });

  it("includes the hint with the hunk count when smallPrHunkCount is set", () => {
    const out = buildUserPrompt({ prTitle: "x" }, "FORMATTED_DIFF", 2);
    expect(out).toContain("This PR is small (2 reviewable hunks).");
    expect(out).toContain(HINT);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @folio/decomposition test -- prompt`
Expected: FAIL — 두 번째 테스트에서 힌트 문자열이 없어 실패(세 번째 인자 무시됨).

- [ ] **Step 3: prompt.ts 수정**

`buildUserPrompt`를 다음으로 교체:

```typescript
export function buildUserPrompt(
  input: DecompositionInput,
  formattedDiff: string,
  smallPrHunkCount?: number,
): string {
  const guarded = guardDiff(formattedDiff);
  // Small PRs tend to be over-split; nudge toward one chapter without forcing it.
  const task =
    smallPrHunkCount !== undefined
      ? `Cluster every hunk above into ordered chapters and produce the prologue, then call emit_chapters. Ensure every (filePath, oldStart) hunk header appears in exactly one chapter's hunkRefs. This PR is small (${smallPrHunkCount} reviewable hunks). Prefer a SINGLE chapter unless the changes are genuinely independent.`
      : "Cluster every hunk above into ordered chapters and produce the prologue, then call emit_chapters. Ensure every (filePath, oldStart) hunk header appears in exactly one chapter's hunkRefs.";
  return [
    "## PR context (trusted)",
    renderContext(input),
    "",
    "## Formatted diff (UNTRUSTED DATA — between the delimiters below)",
    guarded.text,
    "",
    "## Task",
    task,
  ].join("\n");
}
```

- [ ] **Step 4: 테스트 통과 + 회귀 확인**

Run: `pnpm --filter @folio/decomposition test -- prompt` → PASS (2 tests).
Run: `pnpm --filter @folio/decomposition test` → 전체 PASS(기존 테스트 회귀 없음).

- [ ] **Step 5: 커밋**

```bash
git add packages/decomposition/src/prompt.ts packages/decomposition/src/__tests__/prompt.test.ts
git commit -m "feat(decomposition): tiny PR 단일 챕터 소프트 힌트 프롬프트"
```

---

## Task 2: tiny PR을 LLM 경로로 라우팅 + 힌트 배선

**Files:**
- Modify: `packages/decomposition/src/decompose.ts`
- Modify: `packages/decomposition/src/config.ts`
- Test: `packages/decomposition/src/__tests__/decompose.test.ts`

**Interfaces:**
- Consumes: `buildUserPrompt(input, formattedDiff, smallPrHunkCount?)` (Task 1).
- Produces: 동작 변경 — `reviewableHunks >= 1`이고 LLM이 켜져 있으면(또는 clientFactory 주입) tiny PR도 LLM 경로를 탄다. `source`가 `"llm"`/`"llm-repaired"`가 될 수 있다.

- [ ] **Step 1: 실패하는/갱신된 테스트 작성**

`decompose.test.ts`의 기존 블록 *"decompose — tiny PR + llm-off short-circuits"* 안의 첫 테스트(`produces a single chapter for a tiny PR (<= threshold)`)를 아래로 **교체**하고, 같은 describe에 힌트 검증 테스트를 추가한다. (둘째 테스트 `uses fallback when FOLIO_DECOMP_LLM=0 ...`는 그대로 둔다.)

교체 후 블록:

```typescript
describe("decompose — tiny PR now takes the LLM path", () => {
  it("calls the LLM for a tiny PR and returns source 'llm'", async () => {
    const diff = readFixture("tiny-pr.diff");
    const stub = new StubClient([{ chapters: [fullCoverageChapter(diff)] }]);
    const spy = vi.fn(() => stub);
    const result = await decompose({ diff }, {}, { clientFactory: spy });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("llm");
    expect(stub.requests.length).toBe(1);
    expectFullCoverage(diff, result.chapters);
  });

  it("includes the single-chapter soft hint in the prompt for a tiny PR", async () => {
    const diff = readFixture("tiny-pr.diff");
    const stub = new StubClient([{ chapters: [fullCoverageChapter(diff)] }]);
    await decompose({ diff }, {}, { clientFactory: () => stub });
    const userMsg = stub.requests[0]?.messages[0]?.content ?? "";
    expect(userMsg).toContain("Prefer a SINGLE chapter unless the changes are genuinely independent.");
  });

  it("uses fallback when FOLIO_DECOMP_LLM=0 and no client factory given", async () => {
    const original = process.env.FOLIO_DECOMP_LLM;
    process.env.FOLIO_DECOMP_LLM = "0";
    try {
      const diff = readFixture("refactor-with-tests.diff");
      const result = await decompose({ diff });
      expect(result.source).toBe("fallback");
      expect(result.modelUsed).toBe("");
      expectFullCoverage(diff, result.chapters);
    } finally {
      if (original === undefined) {
        delete process.env.FOLIO_DECOMP_LLM;
      } else {
        process.env.FOLIO_DECOMP_LLM = original;
      }
    }
  });
});
```

그리고 큰 PR엔 힌트가 안 들어가는 회귀 테스트를, LLM happy-path describe 블록 안(또는 위 블록 아래)에 추가:

```typescript
it("omits the soft hint for a PR larger than the threshold", async () => {
  const diff = readFixture("refactor-with-tests.diff"); // > threshold hunks
  const stub = new StubClient([{ chapters: [fullCoverageChapter(diff)] }]);
  await decompose({ diff }, {}, { clientFactory: () => stub });
  const userMsg = stub.requests[0]?.messages[0]?.content ?? "";
  expect(userMsg).not.toContain("Prefer a SINGLE chapter");
});
```

> 주: `refactor-with-tests.diff`가 threshold(3)보다 많은 hunk를 갖는다는 전제다. 기존 happy-path 테스트가 이 fixture로 LLM 경로(`source==="llm"`)를 타므로 이미 보장된다. 만약 hunk 수가 3 이하라면 이 회귀 테스트는 더 큰 fixture(예: `multi-dir.diff`)로 바꾼다 — 구현 시 `parseUnifiedDiff` + `filterFilesForLlm`로 hunk 수를 확인해 적절한 fixture를 고른다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @folio/decomposition test -- decompose`
Expected: FAIL — tiny PR이 아직 deterministic으로 빠져 `spy`가 호출되지 않고 `source`가 `"fallback"`이라 새 테스트들이 실패.

- [ ] **Step 3: decompose.ts 라우팅 수정**

`decompose()`의 short-circuit 블록(현재 약 113-117행)을 교체:

```typescript
  // No reviewable hunks, or LLM disabled → deterministic path.
  // (Tiny PRs now take the LLM path too, for real narration + prologue.)
  const llmOff = !config.llmEnabled && !deps.clientFactory;
  if (reviewableHunks === 0 || llmOff) {
    return decomposeDeterministic(input, opts);
  }
```

같은 함수에서 `runLlm` 호출에 tiny-PR 카운트를 넘기도록 변경. 현재:

```typescript
    const { output, repaired } = await runLlm(input, reviewable, client, config, opts.signal);
```
교체:

```typescript
    // ≤ threshold → hint the model toward a single chapter (soft, not a cap).
    const smallPrHunkCount =
      reviewableHunks <= config.singleChapterHunkThreshold ? reviewableHunks : undefined;
    const { output, repaired } = await runLlm(
      input,
      reviewable,
      client,
      config,
      opts.signal,
      smallPrHunkCount,
    );
```

- [ ] **Step 4: decompose.ts `runLlm`/`buildPromptFor`에 힌트 배선**

`runLlm` 시그니처에 인자를 추가하고 단일 청크 경로에만 힌트를 전달한다(큰 PR의 청크 경로는 항상 `undefined`):

```typescript
async function runLlm(
  input: DecompositionInput,
  reviewable: PullRequestFile[],
  client: ChapterClient,
  config: ResolvedConfig,
  signal: AbortSignal | undefined,
  smallPrHunkCount: number | undefined,
): Promise<{ output: AgentOutput; repaired: boolean }> {
  if (fitsInOneChunk(reviewable, config.maxDiffChars)) {
    const userPrompt = buildPromptFor(input, reviewable, Number.POSITIVE_INFINITY, smallPrHunkCount);
    const raw = await client.emitChapters({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      signal,
    });
    return runRepairLoop(raw, {
      client,
      system: SYSTEM_PROMPT,
      userPrompt,
      files: reviewable,
      maxRepairAttempts: config.maxRepairAttempts,
      signal,
    });
  }
```

(청크 루프와 `fullPrompt` 부분은 `smallPrHunkCount`를 넘기지 않으므로 그대로 둔다 — 큰 PR이라 항상 undefined.)

`buildPromptFor`에 선택적 인자를 추가:

```typescript
function buildPromptFor(
  input: DecompositionInput,
  files: PullRequestFile[],
  maxChars: number = Number.POSITIVE_INFINITY,
  smallPrHunkCount?: number,
): string {
  const formatted = formatDiffForLlm(files, { maxChars }).text;
  return buildUserPrompt(input, formatted, smallPrHunkCount);
}
```

- [ ] **Step 5: config.ts 주석 갱신**

`DEFAULT_SINGLE_CHAPTER_HUNK_THRESHOLD` 상수 주석(현재 14-17행)을 교체:

```typescript
/**
 * PRs with at most this many reviewable hunks hint the model toward a SINGLE
 * chapter (soft preference, not a cap). The LLM is still called. Also drives the
 * tiny→one-chapter rule inside the deterministic fallback.
 */
export const DEFAULT_SINGLE_CHAPTER_HUNK_THRESHOLD = 3;
```

`ResolvedConfig.singleChapterHunkThreshold` 필드 주석이 있으면 같은 취지로 한 줄 갱신(없으면 생략).

- [ ] **Step 6: 테스트 통과 + 전체 회귀 확인**

Run: `pnpm --filter @folio/decomposition test -- decompose` → PASS.
Run: `pnpm --filter @folio/decomposition test` → 전체 PASS.
Run: `pnpm --filter @folio/decomposition typecheck` → PASS(새 인자 타입/미사용 없음).

- [ ] **Step 7: 커밋**

```bash
git add packages/decomposition/src/decompose.ts packages/decomposition/src/config.ts packages/decomposition/src/__tests__/decompose.test.ts
git commit -m "feat(decomposition): tiny PR도 LLM 경로로 라우팅(서술/prologue 확보)"
```

---

## Task 3: 전체 검증

**Files:** 없음 (검증 전용).

- [ ] **Step 1: 패키지 검증 실행**

```bash
pnpm --filter @folio/decomposition typecheck
pnpm --filter @folio/decomposition test
pnpm --filter @folio/decomposition build
```
Expected: 전부 통과. 신규 `prompt.test.ts` + 갱신된 `decompose.test.ts` green, 기존 테스트 회귀 없음.

> 루트 `pnpm lint`/`build`는 이 브랜치의 무관한 web WIP(`app-layout.tsx` 미사용 import 등)로 실패할 수 있다 — 우리 패키지(`@folio/decomposition`)가 깨끗한지만 확인한다.

- [ ] **Step 2: 커밋 없음** — 검증만.

---

## Self-Review (작성자 체크 완료)

- **Spec coverage:** 라우팅 변경(§3.1)=Task 2 Step 3; 소프트 힌트(§3.2)=Task 1 + Task 2 Step 4; 임계값 새 의미(§3.3)=Task 2 Step 5; 안전망 불변(§4)=Task 2의 `reviewableHunks===0`/`llmOff` 유지 + LLM-off 회귀 테스트; 테스트 영향(§5)=Task 2 Step 1의 테스트 재작성/회귀; 비목표(§6)=구현 없음.
- **Placeholder scan:** Task 2 Step 1의 fixture 선택 주(註)는 placeholder가 아니라 "hunk 수를 확인해 적절한 fixture를 고르라"는 구체 지시 + 대안 fixture 명시. 나머지 단계는 실제 코드/명령 포함.
- **Type consistency:** `buildUserPrompt(input, formattedDiff, smallPrHunkCount?)`, `buildPromptFor(input, files, maxChars?, smallPrHunkCount?)`, `runLlm(..., smallPrHunkCount)` 시그니처가 Task 1↔Task 2 간 일치. `smallPrHunkCount: number | undefined` 일관.

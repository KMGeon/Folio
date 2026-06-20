# tiny-PR을 LLM 경로로 합류 (분해 품질)

- 작성일: 2026-06-21
- 대상 패키지: `packages/decomposition`
- 상태: 설계 합의 완료, 구현 계획 대기

## 1. 문제

분해 엔진은 리뷰 가능한 hunk가 `singleChapterHunkThreshold`(기본 3) 이하면 LLM을
**아예 호출하지 않고** 규칙 기반 `decomposeDeterministic()`으로 보낸다
(`decompose.ts:113-117`). 그 결과 작은 PR은 제목 "Apply changes", 요약
"All changes in this pull request, grouped into a single chapter.", 그리고
플레이스홀더 prologue를 받는다 (`fallback.ts:79-88`). 챕터가 1개인 건 작은 PR엔
맞을 수 있어도, **서술(title/summary)·key changes·prologue 같은 지능은 오직
LLM에서만 나오므로** 작은 PR은 그 지능을 통째로 잃는다.

근본 원인: tiny-PR 임계값이 **두 가지 별개 결정**을 하나로 묶고 있다.
1. LLM을 호출할 것인가?
2. 몇 챕터로 쪼갤 것인가?

`hunk ≤ threshold`이면 (1) "호출 안 함" + (2) "무조건 1챕터"가 동시에 강제된다.

## 2. 결정

**hunk가 1개라도 있으면 항상 LLM을 호출한다.** 비용/지연이 늘더라도 모든 PR이
제대로 된 서술과 prologue를 받는 것을 택한다. 임계값은 "LLM on/off 스위치"에서
**"1챕터를 선호하라는 소프트 힌트"** 로 의미가 바뀐다.

> 대안(검토 후 기각):
> - trivial(예: 1 hunk)만 no-LLM 빠른 경로 유지 → 여전히 일부 PR이 지능을 못 받음.
> - tiny PR을 저렴한 Ollama 티어로 라우팅 → Ollama 미설치 환경에선 개선 없음, 또
>   가용성 목적의 폴백 기능을 다른 용도로 재배치하는 셈이라 결합이 커짐.

## 3. 변경 사항

### 3.1 라우팅 (`decompose.ts`)

`decompose()`의 short-circuit 조건에서 `reviewableHunks <= threshold`를 제거한다.

```
// 현재
const llmOff = !config.llmEnabled && !deps.clientFactory;
if (reviewableHunks === 0 || reviewableHunks <= config.singleChapterHunkThreshold || llmOff) {
  return decomposeDeterministic(input, opts);
}

// 변경
const llmOff = !config.llmEnabled && !deps.clientFactory;
if (reviewableHunks === 0 || llmOff) {
  return decomposeDeterministic(input, opts);
}
```

- `reviewableHunks === 0`(리뷰할 hunk 없음) → 여전히 deterministic. 서술할 대상이
  없으므로 LLM을 호출하지 않는다.
- `llmOff`(`FOLIO_DECOMP_LLM=0` 그리고 테스트 clientFactory 미주입) → deterministic.
- 그 외 모든 PR(작은 PR 포함) → LLM 경로. deterministic은 이제 순수 폴백(LLM off /
  LLM 실패 / 0 hunk)으로만 도달한다.

### 3.2 소프트 힌트 (`prompt.ts` + `decompose.ts`)

`reviewableHunks <= threshold`일 때, user 프롬프트의 `## Task` 블록에 한 줄을
추가한다. 하드 캡이 아니라 소프트 선호이며, 진짜 독립적인 변경이면 LLM이 그대로
여러 챕터로 쪼갤 수 있다.

추가 문구(작은 PR일 때만):
> "This PR is small (N reviewable hunks). Prefer a SINGLE chapter unless the
> changes are genuinely independent."

구현 방식: `buildUserPrompt(input, formattedDiff, smallPrHunkCount?)`에 선택적
인자를 추가한다. `smallPrHunkCount`가 주어지면(=tiny PR) 위 문장을 `## Task`에
끼워 넣고, 없으면 기존 그대로다. `decompose.ts`의 `buildPromptFor`/`runLlm`이
`reviewableHunks <= threshold`일 때 그 카운트를 넘긴다.

> SYSTEM_PROMPT에는 이미 "split only when changes are truly independent" 규칙이
> 있으므로(`prompt.ts:16`), 이 힌트는 LLM이 작은 diff를 과분할하는 경향을 누르는
> 보강 성격이다.

### 3.3 임계값의 새 의미 (`config.ts`)

`singleChapterHunkThreshold`(기본 3)는 유지하되 주석을 갱신한다: "이 이하의 PR은
LLM에게 단일 챕터를 선호하도록 힌트를 준다(LLM 호출은 항상 한다)." 동시에 이 값은
deterministic 폴백 내부의 tiny→1챕터 규칙(`buildFallbackChapters`)에서 계속
쓰인다 — 그 용법은 변하지 않는다.

## 4. 변하지 않는 것 (안전망)

- 0 hunk → deterministic (빈 챕터 + emptyPrologue), LLM 호출 없음.
- `FOLIO_DECOMP_LLM=0` → deterministic.
- LLM 실패 → 기존 repair 루프(최대 2회) → 우리가 구축한 Codex→Ollama→deterministic
  3단 폴백이 그대로 적용. 작은 PR이 LLM에서 실패하면 결국 "Apply changes"
  deterministic 출력으로 떨어진다(이제는 진짜 폴백일 때만).
- `decomposeDeterministic`은 harness `--no-llm`과 폴백에서 계속 사용된다.

## 5. 테스트 영향 (의도된 동작 변경)

`packages/decomposition/src/__tests__/decompose.test.ts`의 기존 테스트
*"produces a single chapter for a tiny PR (<= threshold)"* 는 **현재 동작
변경으로 깨진다** — tiny PR이 더는 LLM을 건너뛰지 않기 때문이다. 다음으로 재작성한다:

- tiny PR(≤ threshold hunk)이 이제 LLM(stub clientFactory)을 **호출한다**:
  - `clientFactory` spy가 호출됨.
  - `result.source === "llm"`.
  - stub에 준 챕터/서술이 결과에 반영됨.
- tiny PR일 때 user 프롬프트에 소프트 힌트 문장이 포함된다(StubClient가 기록한
  `requests[0].messages[0].content`에 "Prefer a SINGLE chapter" 포함 검증).
- threshold보다 큰 PR에서는 힌트 문장이 포함되지 않는다(회귀).
- `FOLIO_DECOMP_LLM=0` + clientFactory 미주입 → 여전히 deterministic(회귀).
- 0 hunk(또는 제외 파일만) → 여전히 deterministic, LLM 미호출(회귀).

## 6. 비목표 (Non-goals)

- prologue 스키마의 `keyChanges` minItems(2)·`focusAreas` minItems(1) 완화 — 아주
  작은 PR에 2개의 prologue keyChange를 강제하는 게 어색할 수 있으나 이번 범위 밖.
- commit 신호를 decompose에 전달(②), deterministic 폴백 그룹핑 개선(③), LLM 실패
  시 graceful degradation(④), 청킹 cross-chunk 재클러스터링(⑤) — 별도 작업.
- 임계값(3)의 값 튜닝 — 소프트 힌트라 영향이 작아 현행 유지.

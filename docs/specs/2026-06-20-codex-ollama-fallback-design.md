# Codex → Ollama Fallback (PR 분해 엔진)

- 작성일: 2026-06-20
- 대상 패키지: `packages/decomposition`, `apps/backend`
- 상태: 설계 합의 완료, 구현 계획 대기

## 1. 목적

PR 분해(decomposition) 엔진은 현재 Codex 하나에만 의존한다. Codex가 rate
limit이나 장애로 응답하지 못하면, 곧바로 규칙 기반 `decomposeDeterministic()`
(품질이 낮은 최종 안전망)으로 떨어진다.

**1순위 목표는 가용성(중단 방지)이다.** Codex가 실패해도 분해가 멈추지 않고,
품질을 유지한 채 동작하도록 Codex와 deterministic 사이에 **로컬 LLM(Ollama)
계층**을 끼운다. 비용 절감이나 평상시 로컬 우선 라우팅은 목표가 아니다.

결과적으로 3단 안전망을 만든다:

```
Codex  →(실패)→  Ollama  →(실패)→  deterministic(규칙 기반)
```

## 2. 현재 구조 (이미 존재하는 추상화)

`packages/decomposition`에는 이미 provider 추상화가 있다. 새 인터페이스를 만들
필요가 없다.

```typescript
// packages/decomposition/src/client.ts
export interface ChapterClient {
  readonly model: string;
  emitChapters(req: ChapterClientRequest): Promise<unknown>;
}
```

- `createCodexClient(config)`가 이 인터페이스의 유일한 구현체다.
- `DecomposeDeps.clientFactory`로 클라이언트를 주입할 수 있다(테스트에서 stub 교체 중).
- `decompose.ts`는 LLM이 모든 시도에 실패하면 try/catch로 `decomposeDeterministic()`
  로 자동 전환해 100% 커버리지를 보장한다.
- `repair.ts`는 Zod 검증 + coverage 검증 실패 시 최대 2회 재-프롬프트한다
  (`emitChapters`를 여러 번 호출할 수 있다).

즉 "Codex 죽으면 중단"은 이미 막혀 있다. 한계는 그 fallback이 **deterministic
(품질 낮음)** 이라는 점이며, 이번 작업은 그 사이에 품질을 유지하는 LLM 계층을
넣는 것이다.

## 3. 설계 결정

### 3.1 조합 위치 — `ChapterClient` 데코레이터 (접근 A)

`createFallbackClient([codex, ollama])`가 `ChapterClient`를 구현한다. 호출마다
순서대로 시도하는 데코레이터다. `decompose.ts`/`repair.ts`의 분해·repair 로직은
건드리지 않고, 기본 `clientFactory`만 fallback 래퍼로 교체한다.

> 대안(접근 B: `runLlm` 전체를 공급자별로 재시도)은 repair 대화 일관성이 더
> 좋지만 `decompose.ts`의 청크 처리/머지를 통째로 두 번 돌릴 수 있어 수정 범위가
> 커진다. 가용성 목표 대비 과하므로 채택하지 않는다.

### 3.2 fallback 트리거 — Codex의 모든 실패

rate limit만 선별하지 않는다. Codex가 어떤 이유로든 throw 하면 Ollama로 넘긴다.
에러 분류 로직이 없어 단순하고, 가용성 목표에 직결된다.

### 3.3 헛친 호출 방지 — Circuit Breaker

데코레이터를 try/catch만으로 두면, Codex가 장시간 막혔을 때 **들어오는 PR마다
실패하는 Codex 호출을 1번씩** 지불한다(인스턴스 단위 sticky 플래그로는 PR 간
상태가 공유되지 않기 때문). 이를 막기 위해 모듈 단위로 공유되는 circuit breaker를
둔다. breaker 하나가 PR 내부(같은 repair 루프)와 PR 간(다음 요청들)을 모두
커버하므로, 별도의 per-PR sticky 플래그는 두지 않는다.

- 실패 1회 = 회로 open (threshold=1, YAGNI).
- 회로가 open이면 cooldown(기본 60s) 동안 들어오는 모든 호출이 Codex를 건너뛰고
  곧장 Ollama로 간다 → 헛친 호출 없음.
- cooldown 만료 후 첫 호출이 half-open 프로브로 Codex를 1번 시도한다. 성공하면
  회로를 닫고 Codex로 정상 복귀, 실패하면 다시 cooldown 동안 open → Codex
  rate-limit이 풀리면 최대 cooldown 안에 자동 복귀.

## 4. 컴포넌트

```
packages/decomposition/src/
  client.ts          (기존) ChapterClient 인터페이스 + createCodexClient
  ollama-client.ts   (신규) createOllamaClient(config): ChapterClient
  fallback-client.ts (신규) createFallbackClient(clients, opts): ChapterClient + CodexBreaker
  config.ts          (수정) Ollama 엔드포인트/모델/enable, cooldown 설정 추가
  decompose.ts       (수정 최소) 기본 clientFactory를 fallback 래퍼로 교체
apps/backend/src/
  config.ts          (수정) 대응 env 스키마 추가
```

### 4.1 `createOllamaClient(config): ChapterClient`

- `${OLLAMA_URL}/chat/completions`(OpenAI 호환)에 POST.
- `response_format: { type: "json_schema", json_schema: emitChaptersTool.input_schema }`
  — Codex의 `outputSchema`와 **동일한 스키마**를 먹인다.
- 응답을 기존 `parsePayload()`에 통과시켜 Codex 구현체와 **반환 형태를 동일하게**
  맞춘다(코드펜스/문자열 래핑 JSON 처리 재사용).
- `model`은 `FOLIO_DECOMP_OLLAMA_MODEL`.

### 4.2 `createFallbackClient(clients, { breaker, now })`

- `clients`: 순서가 있는 `ChapterClient` 목록. 1번은 Codex, 2번은 Ollama.
- `breaker`: `CodexBreaker`(기본값 = 모듈 싱글톤, 테스트에선 주입).
- `now`: `() => number`(기본값 `Date.now`, 테스트에선 가짜 clock 주입).

```typescript
interface CodexBreaker {
  isOpen(now: number): boolean;     // openUntil != null && openUntil > now
  recordFailure(now: number): void; // openUntil = now + cooldownMs
  recordSuccess(): void;            // openUntil = null (close)
}
```

## 5. 데이터 흐름

```
decompose() → runLlm() → runRepairLoop()
   → fallbackClient.emitChapters(req)
        breaker.isOpen(now)?
          ├─ yes ───────────────────────→ ollama.emitChapters(req)
          └─ no → codex.emitChapters(req)
                    ├─ 성공 → breaker.recordSuccess() → 반환
                    └─ throw → breaker.recordFailure(now) → ollama.emitChapters(req)
        ollama 도 throw → 위로 전파
   → (LLM 전부 실패) 기존 decompose.ts try/catch → decomposeDeterministic()
```

핵심: 래퍼는 **Codex만 try/catch로 감싸고** Ollama 실패는 그대로 던진다. 그래야
`decompose.ts`의 "모든 LLM 실패 → deterministic" 최종 안전망이 그대로 작동한다.

## 6. 에러 처리 / 수명

- breaker 상태는 모듈 단위 공유이므로 PR 간 cooldown이 유지된다.
- Ollama가 꺼져 있거나(연결 거부) `FOLIO_DECOMP_OLLAMA=0`으로 비활성이면, 래퍼는
  Ollama 슬롯을 비활성으로 두고 Codex 실패 시 곧장 deterministic으로 떨어진다.
  → **로컬 LLM 미설치 환경에서도 기존 동작과 100% 동일.**
- cooldown 만료 직후 동시에 여러 PR이 들어오면 각자 half-open 프로브를 보낼 수
  있다(동시성). 가용성 목적엔 무해하므로 MVP에서는 그대로 둔다.

## 7. Config (env)

`packages/decomposition/src/config.ts` + `apps/backend/src/config.ts`에 추가:

```bash
FOLIO_DECOMP_OLLAMA=1                          # 0이면 Ollama 슬롯 비활성(기존 동작)
FOLIO_DECOMP_OLLAMA_URL=http://localhost:11434/v1
FOLIO_DECOMP_OLLAMA_MODEL=qwen2.5-coder:14b    # 분해 품질 위해 코더 계열 권장
FOLIO_DECOMP_CODEX_COOLDOWN_MS=60000           # circuit breaker open 유지 시간
```

`.env.example`에도 같은 키를 주석과 함께 추가한다. 기존 `FOLIO_DECOMP_LLM=0`은
LLM 경로 전체(Codex+Ollama)를 끄는 스위치로 그대로 유지된다.

## 8. 테스트

기존 `clientFactory`/`DecomposeDeps` 주입 패턴을 그대로 활용한다.

- `fallback-client` 단위 테스트(fresh breaker + 가짜 clock 주입, 순서 의존 없음):
  - Codex 성공 → Ollama 미호출, breaker 닫힘 유지.
  - Codex throw → Ollama 호출, breaker open 기록.
  - breaker open 상태 → Codex 건너뛰고 Ollama 직행.
  - cooldown 만료 → half-open에서 Codex 재시도, 성공 시 close.
  - Ollama 도 throw → 에러 위로 전파(데코레이터가 삼키지 않음).
- `ollama-client` 단위 테스트(fetch mock):
  - 요청 바디의 model/URL/`response_format` json_schema 검증.
  - 코드펜스/문자열 래핑 응답이 `parsePayload`를 통과해 정상 형태로 반환.
- 회귀 테스트:
  - `FOLIO_DECOMP_OLLAMA=0`일 때 Codex 실패 → deterministic 경로가 기존과 동일.

## 9. 비목표 (Non-goals)

- 평상시 로컬 우선 라우팅 / 비용 절감 라우팅.
- Codex rate-limit 에러만 선별적으로 식별하는 분류 로직.
- 사전 할당량 추적(요청/토큰 카운팅).
- breaker의 다중 실패 임계치, 지수 backoff, 동시성 프로브 억제 — 필요해지면 후속.

# Codex → Ollama Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR 분해 엔진이 Codex 실패 시 로컬 Ollama로, Ollama 실패 시 기존 deterministic 규칙 기반으로 떨어지는 3단 가용성 안전망을 갖게 한다.

**Architecture:** 기존 `ChapterClient` 인터페이스는 그대로 두고, ① Ollama용 구현체(`createOllamaClient`)와 ② Codex→Ollama 데코레이터(`createFallbackClient`) + circuit breaker를 신규 추가한다. `decompose.ts`의 분해·repair 로직은 손대지 않고, 기본 `clientFactory`만 신규 `createDefaultClient`로 교체한다.

**Tech Stack:** TypeScript ESM, vitest, Zod, Ollama OpenAI 호환 엔드포인트(`/v1/chat/completions` + `response_format: json_schema`), 전역 `fetch`.

## Global Constraints

- 패키지 작업 디렉터리: `packages/decomposition` (테스트는 `pnpm --filter @folio/decomposition test`, 루트에선 `pnpm test`).
- 테스트 러너: `vitest run`. 테스트 파일은 `src/__tests__/*.test.ts`.
- 파일/모듈 명명: `helpers`/`utils`/`common` 금지 — 도메인 개념으로 명명.
- 타입은 `.ts` 모듈로. `max-lines` disable 추가 금지, `--no-verify` 금지.
- 주석은 "왜"만 1~2줄.
- `decompose.ts`의 "모든 LLM 실패 → deterministic" 최종 안전망은 절대 깨지면 안 된다. fallback 데코레이터는 **Codex만 try/catch로 감싸고 Ollama 실패는 그대로 던진다.**
- circuit breaker threshold = 실패 1회 = open. cooldown 기본값 `FOLIO_DECOMP_CODEX_COOLDOWN_MS=60000`.
- 환경변수 기본값: `FOLIO_DECOMP_OLLAMA`(미설정=활성), `FOLIO_DECOMP_OLLAMA_URL=http://localhost:11434/v1`, `FOLIO_DECOMP_OLLAMA_MODEL=qwen2.5-coder:14b`.

---

## File Structure

- `packages/decomposition/src/config.ts` — **수정**: `ResolvedConfig`에 ollama/cooldown 필드 + 기본값/resolver 추가.
- `packages/decomposition/src/client.ts` — **수정**: `parsePayload`를 `parseStructuredPayload`로 export(Ollama 클라이언트와 공유).
- `packages/decomposition/src/ollama-client.ts` — **신규**: `createOllamaClient(config): ChapterClient`.
- `packages/decomposition/src/fallback-client.ts` — **신규**: `CodexBreaker`, `createCodexBreaker`, `createFallbackClient`, `createDefaultClient`.
- `packages/decomposition/src/decompose.ts` — **수정 최소**: 기본 클라이언트 팩토리를 `createDefaultClient`로 교체.
- `apps/backend/src/config.ts` — **수정**: 대응 env 스키마 추가(검증/가시성).
- `.env.example` — **수정**: 신규 키 주석과 함께 추가.
- 테스트: `src/__tests__/config.test.ts`(신규), `src/__tests__/ollama-client.test.ts`(신규), `src/__tests__/fallback-client.test.ts`(신규).

---

## Task 1: Config에 Ollama + cooldown 필드 추가

**Files:**
- Modify: `packages/decomposition/src/config.ts`
- Test: `packages/decomposition/src/__tests__/config.test.ts` (신규)

**Interfaces:**
- Consumes: 없음.
- Produces: `ResolvedConfig`에 `ollamaEnabled: boolean`, `ollamaUrl: string`, `ollamaModel: string`, `codexCooldownMs: number` 추가. 상수 `DEFAULT_OLLAMA_URL`, `DEFAULT_OLLAMA_MODEL`, `DEFAULT_CODEX_COOLDOWN_MS`, 함수 `isOllamaEnabled(): boolean` export.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `packages/decomposition/src/__tests__/config.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CODEX_COOLDOWN_MS,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_URL,
  resolveConfig,
} from "../config.js";

const KEYS = [
  "FOLIO_DECOMP_OLLAMA",
  "FOLIO_DECOMP_OLLAMA_URL",
  "FOLIO_DECOMP_OLLAMA_MODEL",
  "FOLIO_DECOMP_CODEX_COOLDOWN_MS",
] as const;

afterEach(() => {
  for (const k of KEYS) {
    delete process.env[k];
  }
});

describe("resolveConfig — ollama + cooldown", () => {
  it("defaults ollama on, with documented url/model/cooldown", () => {
    const c = resolveConfig();
    expect(c.ollamaEnabled).toBe(true);
    expect(c.ollamaUrl).toBe(DEFAULT_OLLAMA_URL);
    expect(c.ollamaModel).toBe(DEFAULT_OLLAMA_MODEL);
    expect(c.codexCooldownMs).toBe(DEFAULT_CODEX_COOLDOWN_MS);
  });

  it("disables ollama when FOLIO_DECOMP_OLLAMA=0", () => {
    process.env.FOLIO_DECOMP_OLLAMA = "0";
    expect(resolveConfig().ollamaEnabled).toBe(false);
  });

  it("reads url/model/cooldown overrides from env", () => {
    process.env.FOLIO_DECOMP_OLLAMA_URL = "http://host:1234/v1";
    process.env.FOLIO_DECOMP_OLLAMA_MODEL = "llama3.1:8b";
    process.env.FOLIO_DECOMP_CODEX_COOLDOWN_MS = "5000";
    const c = resolveConfig();
    expect(c.ollamaUrl).toBe("http://host:1234/v1");
    expect(c.ollamaModel).toBe("llama3.1:8b");
    expect(c.codexCooldownMs).toBe(5000);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @folio/decomposition test -- config.test`
Expected: FAIL — `ollamaEnabled` 등이 `undefined`, export 누락으로 import 에러.

- [ ] **Step 3: config.ts 수정**

`DEFAULT_MAX_DIFF_CHARS` 상수 블록 바로 아래에 상수를 추가:

```typescript
/** Default Ollama OpenAI-compatible base URL (local install). */
export const DEFAULT_OLLAMA_URL = "http://localhost:11434/v1";

/** Default local model for the fallback path; a coder model handles decomposition better. */
export const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:14b";

/** How long the Codex circuit breaker stays open after a failure (ms). */
export const DEFAULT_CODEX_COOLDOWN_MS = 60_000;
```

`ResolvedConfig` 인터페이스에 필드를 추가(`apiKey` 줄 아래):

```typescript
  /** Whether the Ollama fallback slot is enabled; false skips it (Codex → deterministic). */
  ollamaEnabled: boolean;
  /** Ollama OpenAI-compatible base URL (the path before /chat/completions). */
  ollamaUrl: string;
  /** Local model id for the Ollama fallback. */
  ollamaModel: string;
  /** Circuit-breaker open duration (ms) after a Codex failure. */
  codexCooldownMs: number;
```

`isLlmEnabled` 함수 아래에 resolver 추가:

```typescript
/** True unless explicitly disabled with `FOLIO_DECOMP_OLLAMA=0` (mirrors the LLM switch). */
export function isOllamaEnabled(): boolean {
  return process.env.FOLIO_DECOMP_OLLAMA?.trim() !== "0";
}
```

`resolveConfig`의 반환 객체에 `apiKey:` 줄 아래로 추가:

```typescript
    ollamaEnabled: isOllamaEnabled(),
    ollamaUrl: process.env.FOLIO_DECOMP_OLLAMA_URL?.trim() || DEFAULT_OLLAMA_URL,
    ollamaModel: process.env.FOLIO_DECOMP_OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
    codexCooldownMs:
      Number(process.env.FOLIO_DECOMP_CODEX_COOLDOWN_MS) || DEFAULT_CODEX_COOLDOWN_MS,
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @folio/decomposition test -- config.test`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add packages/decomposition/src/config.ts packages/decomposition/src/__tests__/config.test.ts
git commit -m "feat(decomposition): config에 Ollama fallback + circuit breaker 설정 추가"
```

---

## Task 2: Ollama 클라이언트 구현 (`createOllamaClient`)

**Files:**
- Modify: `packages/decomposition/src/client.ts` (parsePayload export)
- Create: `packages/decomposition/src/ollama-client.ts`
- Test: `packages/decomposition/src/__tests__/ollama-client.test.ts` (신규)

**Interfaces:**
- Consumes: `ResolvedConfig`(Task 1의 `ollamaUrl`/`ollamaModel`/`temperature`), `emitChaptersTool`(`./tool.js`), `ChapterClient`/`ChapterClientRequest`/`NoStructuredOutputError`/`parseStructuredPayload`(`./client.js`).
- Produces: `createOllamaClient(config: ResolvedConfig): ChapterClient`. POST `${config.ollamaUrl}/chat/completions`, `response_format` json_schema = `emitChaptersTool.input_schema`, 응답 `choices[0].message.content`를 `parseStructuredPayload`로 파싱.

- [ ] **Step 1: client.ts의 parsePayload를 export로 노출**

`client.ts`에서 `function parsePayload`의 선언을 export + 이름 변경하고, 내부 호출처를 갱신한다. 변경 대상은 다음 한 줄의 함수 시그니처와 `createCodexClient` 내부의 호출부:

기존:
```typescript
function parsePayload(text: string): unknown {
```
변경:
```typescript
/** Extract the structured payload from a model final response (raw or fenced JSON). Shared by Codex + Ollama clients. */
export function parseStructuredPayload(text: string): unknown {
```

그리고 `createCodexClient` 내부 `return parsePayload(turn.finalResponse);` 를:
```typescript
      return parseStructuredPayload(turn.finalResponse);
```
로 변경.

- [ ] **Step 2: 실패하는 테스트 작성**

Create `packages/decomposition/src/__tests__/ollama-client.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoStructuredOutputError } from "../client.js";
import type { ResolvedConfig } from "../config.js";
import { createOllamaClient } from "../ollama-client.js";

const config = {
  ollamaUrl: "http://localhost:11434/v1",
  ollamaModel: "qwen2.5-coder:14b",
  temperature: 0.2,
} as unknown as ResolvedConfig;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "ERR",
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createOllamaClient", () => {
  it("posts to /chat/completions with the emit_chapters json_schema and the configured model", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: '{"chapters":[]}' } }] }));

    const client = createOllamaClient(config);
    await client.emitChapters({ system: "SYS", messages: [{ role: "user", content: "U" }] });

    expect(client.model).toBe("qwen2.5-coder:14b");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.model).toBe("qwen2.5-coder:14b");
    expect(sent.messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(sent.messages[1]).toEqual({ role: "user", content: "U" });
    expect(sent.response_format.type).toBe("json_schema");
    expect(sent.response_format.json_schema.name).toBe("emit_chapters");
  });

  it("parses fenced/prose-wrapped JSON via parseStructuredPayload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'noise ```json\n{"chapters":[1]}\n```' } }] }),
    );
    const client = createOllamaClient(config);
    const out = await client.emitChapters({ system: "S", messages: [] });
    expect(out).toEqual({ chapters: [1] });
  });

  it("throws on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, false, 500));
    const client = createOllamaClient(config);
    await expect(client.emitChapters({ system: "S", messages: [] })).rejects.toThrow(/500/);
  });

  it("throws NoStructuredOutputError when content is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "" } }] }),
    );
    const client = createOllamaClient(config);
    await expect(client.emitChapters({ system: "S", messages: [] })).rejects.toBeInstanceOf(
      NoStructuredOutputError,
    );
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm --filter @folio/decomposition test -- ollama-client`
Expected: FAIL — `../ollama-client.js` 모듈 없음.

- [ ] **Step 4: ollama-client.ts 구현**

Create `packages/decomposition/src/ollama-client.ts`:

```typescript
// Ollama fallback client. Calls the OpenAI-compatible /chat/completions endpoint
// with the same emit_chapters json_schema Codex uses, so the parsed payload shape
// is identical and the repair loop / Zod validation downstream stay unchanged.

import {
  type ChapterClient,
  type ChapterClientRequest,
  NoStructuredOutputError,
  parseStructuredPayload,
} from "./client.js";
import type { ResolvedConfig } from "./config.js";
import { emitChaptersTool } from "./tool.js";

interface OllamaChatResponse {
  choices?: { message?: { content?: string } }[];
}

/** Ollama has a real system role, so the system prompt stays a separate message. */
function toMessages(req: ChapterClientRequest): { role: string; content: string }[] {
  return [{ role: "system", content: req.system }, ...req.messages];
}

export function createOllamaClient(config: ResolvedConfig): ChapterClient {
  return {
    model: config.ollamaModel,
    async emitChapters(req: ChapterClientRequest): Promise<unknown> {
      const res = await fetch(`${config.ollamaUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.ollamaModel,
          temperature: config.temperature,
          messages: toMessages(req),
          response_format: {
            type: "json_schema",
            json_schema: {
              name: emitChaptersTool.name,
              schema: emitChaptersTool.input_schema,
              strict: true,
            },
          },
        }),
        signal: req.signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as OllamaChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new NoStructuredOutputError();
      }
      return parseStructuredPayload(content);
    },
  };
}
```

- [ ] **Step 5: 테스트 통과 + 기존 client 회귀 확인**

Run: `pnpm --filter @folio/decomposition test`
Expected: PASS — 신규 ollama-client 4 tests + 기존 테스트 전부 그대로 통과(parsePayload rename 회귀 없음).

- [ ] **Step 6: 커밋**

```bash
git add packages/decomposition/src/client.ts packages/decomposition/src/ollama-client.ts packages/decomposition/src/__tests__/ollama-client.test.ts
git commit -m "feat(decomposition): Ollama OpenAI 호환 fallback 클라이언트 추가"
```

---

## Task 3: Circuit breaker + fallback 데코레이터

**Files:**
- Create: `packages/decomposition/src/fallback-client.ts`
- Test: `packages/decomposition/src/__tests__/fallback-client.test.ts` (신규)

**Interfaces:**
- Consumes: `ChapterClient`(`./client.js`), `StubClient`(테스트, `./helpers.js`).
- Produces:
  - `interface CodexBreaker { isOpen(now: number): boolean; recordFailure(now: number): void; recordSuccess(): void; }`
  - `createCodexBreaker(cooldownMs: number): CodexBreaker`
  - `createFallbackClient(primary: ChapterClient, secondary: ChapterClient | null, opts?: { breaker?: CodexBreaker; now?: () => number }): ChapterClient`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `packages/decomposition/src/__tests__/fallback-client.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createCodexBreaker, createFallbackClient } from "../fallback-client.js";
import { StubClient } from "./helpers.js";

const req = { system: "S", messages: [] as { role: "user" | "assistant"; content: string }[] };

describe("createCodexBreaker", () => {
  it("opens for cooldown on failure and closes on success", () => {
    const b = createCodexBreaker(1000);
    expect(b.isOpen(0)).toBe(false);
    b.recordFailure(0);
    expect(b.isOpen(500)).toBe(true);
    expect(b.isOpen(1000)).toBe(false); // boundary: openUntil is exclusive
    b.recordFailure(2000);
    b.recordSuccess();
    expect(b.isOpen(2100)).toBe(false);
  });
});

describe("createFallbackClient", () => {
  it("uses primary on success and never touches secondary", async () => {
    const primary = new StubClient([{ chapters: [1] }], "codex");
    const secondary = new StubClient([{ chapters: [2] }], "ollama");
    const client = createFallbackClient(primary, secondary, { now: () => 0 });
    const out = await client.emitChapters(req);
    expect(out).toEqual({ chapters: [1] });
    expect(secondary.requests.length).toBe(0);
    expect(client.model).toBe("codex");
  });

  it("falls to secondary when primary throws, and opens the breaker", async () => {
    const primary = new StubClient([new Error("boom")], "codex");
    const secondary = new StubClient([{ chapters: [2] }], "ollama");
    const breaker = createCodexBreaker(1000);
    const client = createFallbackClient(primary, secondary, { breaker, now: () => 100 });
    const out = await client.emitChapters(req);
    expect(out).toEqual({ chapters: [2] });
    expect(secondary.requests.length).toBe(1);
    expect(breaker.isOpen(200)).toBe(true);
    expect(client.model).toBe("ollama"); // modelUsed reflects who actually answered
  });

  it("skips primary entirely while the breaker is open", async () => {
    const primary = new StubClient([{ chapters: [1] }], "codex");
    const secondary = new StubClient([{ chapters: [2] }], "ollama");
    const breaker = createCodexBreaker(1000);
    breaker.recordFailure(0);
    const client = createFallbackClient(primary, secondary, { breaker, now: () => 500 });
    const out = await client.emitChapters(req);
    expect(out).toEqual({ chapters: [2] });
    expect(primary.requests.length).toBe(0);
  });

  it("propagates the error when secondary is null (preserves deterministic safety net)", async () => {
    const primary = new StubClient([new Error("boom")], "codex");
    const client = createFallbackClient(primary, null, { now: () => 0 });
    await expect(client.emitChapters(req)).rejects.toThrow("boom");
  });

  it("propagates when secondary also throws", async () => {
    const primary = new StubClient([new Error("p")], "codex");
    const secondary = new StubClient([new Error("s")], "ollama");
    const client = createFallbackClient(primary, secondary, { now: () => 0 });
    await expect(client.emitChapters(req)).rejects.toThrow("s");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @folio/decomposition test -- fallback-client`
Expected: FAIL — `../fallback-client.js` 모듈 없음.

- [ ] **Step 3: fallback-client.ts 구현** (`createDefaultClient`는 Task 4에서 추가)

Create `packages/decomposition/src/fallback-client.ts`:

```typescript
// Codex → Ollama fallback decorator + Codex circuit breaker.
//
// The decorator wraps ONLY Codex in try/catch and lets Ollama errors propagate,
// so decompose.ts's "any LLM failure → deterministic" final safety net still fires
// when both providers fail. The breaker is shared across decompose() calls so a
// Codex outage stops being re-probed on every PR for `cooldownMs`.

import type { ChapterClient, ChapterClientRequest } from "./client.js";

export interface CodexBreaker {
  /** Open while openUntil > now (exclusive); a half-open probe is allowed at now === openUntil. */
  isOpen(now: number): boolean;
  recordFailure(now: number): void;
  recordSuccess(): void;
}

export function createCodexBreaker(cooldownMs: number): CodexBreaker {
  let openUntil: number | null = null;
  return {
    isOpen: (now) => openUntil !== null && openUntil > now,
    recordFailure: (now) => {
      openUntil = now + cooldownMs;
    },
    recordSuccess: () => {
      openUntil = null;
    },
  };
}

export interface FallbackOptions {
  breaker?: CodexBreaker;
  now?: () => number;
}

/**
 * Try `primary` (Codex) first; on failure (or while the breaker is open) use
 * `secondary` (Ollama). `secondary` null = no fallback slot (Codex → deterministic).
 * `model` reflects whoever last answered, so `modelUsed` telemetry stays accurate.
 */
export function createFallbackClient(
  primary: ChapterClient,
  secondary: ChapterClient | null,
  opts: FallbackOptions = {},
): ChapterClient {
  const breaker = opts.breaker ?? createCodexBreaker(0);
  const now = opts.now ?? Date.now;
  let lastModel = primary.model;

  return {
    get model() {
      return lastModel;
    },
    async emitChapters(req: ChapterClientRequest): Promise<unknown> {
      if (secondary && breaker.isOpen(now())) {
        lastModel = secondary.model;
        return secondary.emitChapters(req);
      }
      try {
        const out = await primary.emitChapters(req);
        breaker.recordSuccess();
        lastModel = primary.model;
        return out;
      } catch (err) {
        breaker.recordFailure(now());
        if (secondary) {
          lastModel = secondary.model;
          return secondary.emitChapters(req);
        }
        throw err;
      }
    },
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @folio/decomposition test -- fallback-client`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add packages/decomposition/src/fallback-client.ts packages/decomposition/src/__tests__/fallback-client.test.ts
git commit -m "feat(decomposition): Codex 회로 차단기 + Ollama fallback 데코레이터"
```

---

## Task 4: 기본 클라이언트 배선 (`createDefaultClient`) + decompose.ts 교체

**Files:**
- Modify: `packages/decomposition/src/fallback-client.ts` (`createDefaultClient` 추가)
- Modify: `packages/decomposition/src/decompose.ts` (기본 팩토리 교체)
- Test: `packages/decomposition/src/__tests__/fallback-client.test.ts` (createDefaultClient 케이스 추가)

**Interfaces:**
- Consumes: `createCodexClient`(`./client.js`), `createOllamaClient`(`./ollama-client.js`), `ResolvedConfig`(`ollamaEnabled`/`codexCooldownMs`).
- Produces: `createDefaultClient(config: ResolvedConfig, deps?: { codexFactory?: (c: ResolvedConfig) => ChapterClient; ollamaFactory?: (c: ResolvedConfig) => ChapterClient }): ChapterClient`. Codex + (ollamaEnabled일 때) Ollama + 모듈 공유 breaker로 조립.

- [ ] **Step 1: 실패하는 테스트 추가**

`fallback-client.test.ts` 맨 아래에 추가:

```typescript
import { createDefaultClient } from "../fallback-client.js";
import type { ResolvedConfig } from "../config.js";

function cfg(over: Partial<ResolvedConfig>): ResolvedConfig {
  return { ollamaEnabled: true, codexCooldownMs: 1000, ...over } as ResolvedConfig;
}

describe("createDefaultClient", () => {
  it("falls to ollama when codex fails and ollama is enabled", async () => {
    const codex = new StubClient([new Error("boom")], "codex");
    const ollama = new StubClient([{ chapters: [9] }], "ollama");
    const client = createDefaultClient(cfg({ ollamaEnabled: true }), {
      codexFactory: () => codex,
      ollamaFactory: () => ollama,
    });
    const out = await client.emitChapters(req);
    expect(out).toEqual({ chapters: [9] });
  });

  it("propagates codex failure when ollama is disabled (→ deterministic upstream)", async () => {
    const codex = new StubClient([new Error("boom")], "codex");
    const ollama = new StubClient([{ chapters: [9] }], "ollama");
    const client = createDefaultClient(cfg({ ollamaEnabled: false }), {
      codexFactory: () => codex,
      ollamaFactory: () => ollama,
    });
    await expect(client.emitChapters(req)).rejects.toThrow("boom");
    expect(ollama.requests.length).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @folio/decomposition test -- fallback-client`
Expected: FAIL — `createDefaultClient` export 없음.

- [ ] **Step 3: createDefaultClient 구현**

`fallback-client.ts` 상단 import에 추가:

```typescript
import { type ChapterClient, type ChapterClientRequest, createCodexClient } from "./client.js";
import type { ResolvedConfig } from "./config.js";
import { createOllamaClient } from "./ollama-client.js";
```

(기존 `import type { ChapterClient, ChapterClientRequest } from "./client.js";` 줄을 위 형태로 교체.)

파일 맨 아래에 추가:

```typescript
/** Module-shared breaker so a Codex outage persists across PRs (decompose() calls). */
let sharedBreaker: CodexBreaker | null = null;

export interface DefaultClientDeps {
  codexFactory?: (config: ResolvedConfig) => ChapterClient;
  ollamaFactory?: (config: ResolvedConfig) => ChapterClient;
}

/**
 * The production client wiring: Codex primary, Ollama fallback (when enabled),
 * guarded by a process-shared circuit breaker. `deps` exists only as a test seam.
 */
export function createDefaultClient(
  config: ResolvedConfig,
  deps: DefaultClientDeps = {},
): ChapterClient {
  const codex = (deps.codexFactory ?? createCodexClient)(config);
  const ollama = config.ollamaEnabled
    ? (deps.ollamaFactory ?? createOllamaClient)(config)
    : null;
  if (!sharedBreaker) {
    sharedBreaker = createCodexBreaker(config.codexCooldownMs);
  }
  return createFallbackClient(codex, ollama, { breaker: sharedBreaker });
}
```

- [ ] **Step 4: decompose.ts의 기본 팩토리 교체**

`decompose.ts` line 17 import를 교체:

기존:
```typescript
import { type ChapterClient, createCodexClient } from "./client.js";
```
변경:
```typescript
import type { ChapterClient } from "./client.js";
import { createDefaultClient } from "./fallback-client.js";
```

line 120의 기본 팩토리를 교체:

기존:
```typescript
    const client = (deps.clientFactory ?? createCodexClient)(config);
```
변경:
```typescript
    const client = (deps.clientFactory ?? createDefaultClient)(config);
```

- [ ] **Step 5: 테스트 통과 + 전체 회귀 확인**

Run: `pnpm --filter @folio/decomposition test`
Expected: PASS — 신규 createDefaultClient 2 tests + 기존 decompose/fallback 테스트 전부 통과(기존 테스트는 `clientFactory`를 직접 주입하므로 영향 없음).

- [ ] **Step 6: 커밋**

```bash
git add packages/decomposition/src/fallback-client.ts packages/decomposition/src/decompose.ts packages/decomposition/src/__tests__/fallback-client.test.ts
git commit -m "feat(decomposition): 기본 클라이언트를 Codex→Ollama fallback 배선으로 교체"
```

---

## Task 5: 백엔드 env 스키마 + `.env.example` 문서화

**Files:**
- Modify: `apps/backend/src/config.ts`
- Modify: `.env.example`
- Test: `apps/backend/src/config.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: 없음(검증/가시성 전용; 실제 값은 decomposition 패키지가 `process.env`에서 직접 읽음).
- Produces: backend `Config`에 `FOLIO_DECOMP_OLLAMA?`, `FOLIO_DECOMP_OLLAMA_URL?`, `FOLIO_DECOMP_OLLAMA_MODEL?`, `FOLIO_DECOMP_CODEX_COOLDOWN_MS?`.

- [ ] **Step 1: 기존 config.test.ts 확인 후 실패 테스트 추가**

먼저 `apps/backend/src/config.test.ts`를 읽어 기존 로드 헬퍼 이름을 확인한다(파일은 `loadConfig`를 내부에서 쓰지 않으면 `config` export를 직접 검증하는 형태일 수 있다). 기존 테스트 스타일에 맞춰, 신규 env가 파싱을 깨지 않고 통과하는 케이스를 추가:

```typescript
it("accepts the optional ollama + cooldown decomposition vars", () => {
  const env = {
    FOLIO_DECOMP_OLLAMA: "0",
    FOLIO_DECOMP_OLLAMA_URL: "http://host:1234/v1",
    FOLIO_DECOMP_OLLAMA_MODEL: "llama3.1:8b",
    FOLIO_DECOMP_CODEX_COOLDOWN_MS: "5000",
  } as NodeJS.ProcessEnv;
  // baseSchema는 모듈 비공개이므로, 기존 테스트가 사용하는 동일한 로드 경로로 검증한다.
  // (기존 테스트가 process.env를 세팅하고 모듈을 재-import 하는 패턴이면 그 패턴을 따른다.)
  expect(() => loadConfigForTest(env)).not.toThrow();
});
```

> 주: 기존 `config.test.ts`의 실제 헬퍼/패턴(예: `process.env` 세팅 + dynamic import, 또는 export된 로더)에 맞춰 위 `loadConfigForTest`를 해당 패턴으로 치환한다. baseSchema가 export되어 있지 않으면 export하지 말고 기존 검증 경로를 재사용한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter backend test -- config`
Expected: FAIL 또는 통과 — z.object는 미정의 키를 기본적으로 통과시키므로, 이 단계의 목적은 "신규 키가 명시적으로 타입에 들어오는지"를 고정하는 것이다. 실패가 안 나면 Step 1 테스트를 `config` 타입에서 키 접근(`cfg.FOLIO_DECOMP_OLLAMA_MODEL`)을 단언하는 형태로 강화한다.

- [ ] **Step 3: backend config.ts에 스키마 추가**

`baseSchema`의 `FOLIO_DECOMP_LLM` 줄 아래에 추가:

```typescript
  // Ollama fallback for decomposition: tried when Codex fails. "0" disables the slot.
  FOLIO_DECOMP_OLLAMA: z.enum(["0", "1"]).optional(),
  FOLIO_DECOMP_OLLAMA_URL: z.string().optional(),
  FOLIO_DECOMP_OLLAMA_MODEL: z.string().optional(),
  // Circuit-breaker open duration (ms) after a Codex failure before it is re-probed.
  FOLIO_DECOMP_CODEX_COOLDOWN_MS: z.coerce.number().int().positive().optional(),
```

- [ ] **Step 4: `.env.example` 갱신**

`.env.example`의 `FOLIO_DECOMP_LLM` 항목 근처에 추가:

```bash
# Ollama fallback (decomposition): tried when Codex fails, before the deterministic fallback.
FOLIO_DECOMP_OLLAMA=1                          # "0" disables the Ollama slot (Codex → deterministic)
FOLIO_DECOMP_OLLAMA_URL=http://localhost:11434/v1
FOLIO_DECOMP_OLLAMA_MODEL=qwen2.5-coder:14b    # a coder model decomposes better
FOLIO_DECOMP_CODEX_COOLDOWN_MS=60000           # circuit breaker open duration after a Codex failure
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter backend test -- config`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add apps/backend/src/config.ts apps/backend/src/config.test.ts .env.example
git commit -m "feat(backend): Ollama fallback + cooldown env 스키마/문서 추가"
```

---

## Task 6: 전체 검증

**Files:** 없음 (검증 전용).

- [ ] **Step 1: 패키지 + 루트 검증 실행**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
Expected: 전부 통과. 특히 `@folio/decomposition` 신규 3개 테스트 파일과 기존 테스트 모두 green, `decompose.ts`/`client.ts` 회귀 없음.

- [ ] **Step 2: 수동 스모크(선택)**

Ollama가 로컬에 떠 있으면: `FOLIO_DECOMP_MODEL`을 일부러 실패하게 두거나(또는 네트워크 차단으로 Codex throw 유도) 큰 PR을 분해해 `modelUsed`가 ollama 모델로 떨어지는지 확인. Ollama 미설치 시 `FOLIO_DECOMP_OLLAMA=0`과 동일하게 deterministic으로 떨어지는지 확인.

- [ ] **Step 3: 커밋 없음** — 검증만.

---

## Self-Review (작성자 체크 완료)

- **Spec coverage:** 3단 안전망(Task 3·4), 트리거=모든 Codex 실패(Task 3), circuit breaker+cooldown(Task 1·3), Ollama OpenAI 호환+동일 스키마(Task 2), `ollamaEnabled` 비활성 시 기존 동작 동일(Task 4 두 번째 테스트), config/env(Task 1·5), 테스트(각 Task), 비목표 항목은 구현 없음으로 준수.
- **Placeholder scan:** Task 5 Step 1의 `loadConfigForTest`는 기존 파일 패턴에 맞춰 치환하라는 명시적 지시이며, 실제 테스트 코드는 기존 파일을 읽고 결정한다(파일 비공개 헬퍼 의존이라 verbatim 고정 불가). 그 외 placeholder 없음.
- **Type consistency:** `ChapterClient`/`ChapterClientRequest`/`ResolvedConfig`/`emitChaptersTool`/`parseStructuredPayload`/`createFallbackClient`/`createDefaultClient`/`CodexBreaker` 시그니처가 정의 Task와 소비 Task 간 일치.

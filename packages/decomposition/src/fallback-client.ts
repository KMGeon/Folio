// Codex → Ollama fallback decorator + Codex circuit breaker.
//
// The decorator wraps ONLY Codex in try/catch and lets Ollama errors propagate,
// so decompose.ts's "any LLM failure → deterministic" final safety net still fires
// when both providers fail. The breaker is shared across decompose() calls so a
// Codex outage stops being re-probed on every PR for `cooldownMs`.

import { type ChapterClient, type ChapterClientRequest, createCodexClient } from "./client.js";
import type { ResolvedConfig } from "./config.js";
import { createOllamaClient } from "./ollama-client.js";

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
  const ollama = config.ollamaEnabled ? (deps.ollamaFactory ?? createOllamaClient)(config) : null;
  if (!sharedBreaker) {
    sharedBreaker = createCodexBreaker(config.codexCooldownMs);
  }
  return createFallbackClient(codex, ollama, { breaker: sharedBreaker });
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

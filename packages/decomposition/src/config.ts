// Defaults + environment resolution for the decomposition engine.
// Centralizes every tunable so the orchestrator, client, repair loop, chunker,
// and Codex client share one source of truth.

/** Default Codex model used for the `emit_chapters` structured-output turn. */
export const DEFAULT_MODEL = "gpt-5.5";

/** Low temperature: decomposition is a near-deterministic structuring task. */
export const DEFAULT_TEMPERATURE = 0.2;

/** Bounded repair re-prompts before returning the best schema-valid model output. */
export const DEFAULT_MAX_REPAIR_ATTEMPTS = 2;

/**
 * PRs with at most this many reviewable hunks hint the model toward a SINGLE
 * chapter (soft preference, not a cap). The LLM is still called. This also
 * drives the deterministic evaluator's tiny→one-chapter rule.
 */
export const DEFAULT_SINGLE_CHAPTER_HUNK_THRESHOLD = 3;

/** Model response token ceiling for one `emit_chapters` call. */
export const DEFAULT_MAX_TOKENS = 8192;

/** Per-request wall-clock budget (ms) before the model call is aborted. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

/**
 * Soft character ceiling for one prompt's formatted diff block. Diffs larger
 * than this are split by `chunking.ts` into multiple per-chunk proposals that
 * are merged before a single coverage validation. Chosen well under the model
 * context window (≈4 chars/token) to leave room for system + instructions.
 */
export const DEFAULT_MAX_DIFF_CHARS = 80_000;

/** Resolved, immutable config the engine actually runs with. */
export interface ResolvedConfig {
  model: string;
  temperature: number;
  maxRepairAttempts: number;
  singleChapterHunkThreshold: number;
  maxTokens: number;
  requestTimeoutMs: number;
  maxDiffChars: number;
}

import type { DecompositionOptions } from "./types.js";

/** Read the model override from `FOLIO_DECOMP_MODEL`, else the default. */
export function resolveModel(optModel?: string): string {
  return optModel ?? process.env.FOLIO_DECOMP_MODEL ?? DEFAULT_MODEL;
}

/** Merge caller options with env + defaults into a fully resolved config. */
export function resolveConfig(opts: DecompositionOptions = {}): ResolvedConfig {
  return {
    model: resolveModel(opts.model),
    temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
    maxRepairAttempts: opts.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS,
    singleChapterHunkThreshold:
      opts.singleChapterHunkThreshold ?? DEFAULT_SINGLE_CHAPTER_HUNK_THRESHOLD,
    maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    requestTimeoutMs: opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    maxDiffChars: opts.maxDiffChars ?? DEFAULT_MAX_DIFF_CHARS,
  };
}

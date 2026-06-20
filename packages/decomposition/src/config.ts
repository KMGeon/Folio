// Defaults + environment resolution for the decomposition engine.
// Centralizes every tunable so the orchestrator, client, repair loop, chunker,
// and fallback share one source of truth.

/** Default Claude model used for `emit_chapters` tool-use. */
export const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Low temperature: decomposition is a near-deterministic structuring task. */
export const DEFAULT_TEMPERATURE = 0.2;

/** Bounded repair re-prompts before giving up and falling back. */
export const DEFAULT_MAX_REPAIR_ATTEMPTS = 2;

/**
 * PRs with at most this many reviewable hunks collapse into a single chapter
 * (LLM path skipped on the deterministic route; tiny-PR rule).
 */
export const DEFAULT_SINGLE_CHAPTER_HUNK_THRESHOLD = 3;

/** Anthropic response token ceiling for one `emit_chapters` call. */
export const DEFAULT_MAX_TOKENS = 8192;

/** Per-request wall-clock budget (ms) before the Anthropic call is aborted. */
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
  apiKey: string | undefined;
}

import type { DecompositionOptions } from "./types.js";

/** Read the model override from `FOLIO_DECOMP_MODEL`, else the SDK key, else default. */
export function resolveModel(optModel?: string): string {
  return optModel ?? process.env.FOLIO_DECOMP_MODEL ?? DEFAULT_MODEL;
}

/** True when an Anthropic API key is present (gates the LLM path). */
export function hasApiKey(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
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
    apiKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
  };
}

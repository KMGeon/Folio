import type { Chapter, Prologue } from "@folio/types";

// ─── Public input / output contracts (issue E2 §Public interface) ────────────

export interface DecompositionInput {
  /** Unified diff text (from G1 via the I2 worker). */
  diff: string;
  /** Changed file paths (optional hint; not required for parsing). */
  files?: string[];
  prTitle?: string;
  prBody?: string | null;
  /** Commit messages — prologue hints + deterministic fallback boundaries. */
  commits?: { sha: string; message: string }[];
}

export interface DecompositionOptions {
  /** Default "gpt-5.5" (or `FOLIO_DECOMP_MODEL`). */
  model?: string;
  /** Sampling temperature; default 0.2. */
  temperature?: number;
  /** Bounded repair re-prompts on validation failure; default 2. */
  maxRepairAttempts?: number;
  /** PRs at/below this hunk count collapse into one chapter. */
  singleChapterHunkThreshold?: number;
  /** Model response token ceiling. */
  maxTokens?: number;
  /** Per-request timeout (ms). */
  requestTimeoutMs?: number;
  /** Soft char ceiling for one prompt's diff block before chunking kicks in. */
  maxDiffChars?: number;
  /** Cancellation propagated to the Codex SDK. */
  signal?: AbortSignal;
}

/** Provenance of the returned chapter set. */
export type DecompositionSource = "llm" | "llm-repaired" | "fallback";

export interface DecompositionResult {
  /** Ordered, 1-indexed chapters in the `@folio/types` wire shape. */
  chapters: Chapter[];
  /** PR-level prologue, or null when none was produced. */
  prologue: Prologue | null;
  source: DecompositionSource;
  /** The model id actually used (empty string on the pure fallback path). */
  modelUsed: string;
}

// @folio/decomposition — the emit_chapters tool-use engine. Decomposes a PR
// unified diff into ordered review chapters + a PR-level prologue, guarantees
// every hunk is covered exactly once, repairs LLM mistakes, and falls back to
// deterministic heuristics on tiny PRs or LLM failure.

export { decompose, decomposeDeterministic, type DecomposeDeps } from "./decompose.js";

export { emitChaptersTool, EMIT_CHAPTERS_TOOL_NAME, type EmitChaptersTool } from "./tool.js";

export { AgentOutputSchema, type AgentOutput, parseAgentOutput } from "./schema.js";

export type { ChapterClient, ChapterClientRequest } from "./client.js";
export { createAnthropicClient, NoToolUseError } from "./client.js";

export {
  coverageOf,
  formatCoverageFeedback,
  isFullyCovered,
  validateHunkCoverage,
  type CoverageReport,
} from "./coverage.js";

export { buildFallbackChapters, collectHunkRefs } from "./fallback.js";

export { buildFallbackPrologue } from "./prologue.js";

export {
  guardDiff,
  neutralizeInjection,
  DIFF_BEGIN,
  DIFF_END,
  type GuardedDiff,
} from "./inject-guard.js";

export { splitIntoChunks, mergeChunkChapters, fitsInOneChunk, type DiffChunk } from "./chunking.js";

export { assembleChapters } from "./assemble.js";

export {
  buildExcludedChanges,
  buildLeftoverChanges,
  mergeHunkRefs,
  OTHER_CHANGES_ID,
  type CatchAllChapter,
} from "./other-changes.js";

export {
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  DEFAULT_SINGLE_CHAPTER_HUNK_THRESHOLD,
  resolveConfig,
  resolveModel,
  hasApiKey,
  type ResolvedConfig,
} from "./config.js";

export { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";

export type {
  DecompositionInput,
  DecompositionOptions,
  DecompositionResult,
  DecompositionSource,
} from "./types.js";

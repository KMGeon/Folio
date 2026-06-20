// Orchestrator. The public entry the I2 worker calls.
//
// Pipeline:
//   parse diff (E1) → filter excluded files → tiny-PR / llm-off short-circuit to
//   deterministic fallback → format + inject-guard → LLM emit_chapters (chunked
//   if large) → Zod + coverage validation → bounded repair loop → assemble wire
//   chapters (+ excluded "Other changes" bucket) → final coverage guarantee.
//
// The engine NEVER throws a coverage error to the caller: any LLM failure,
// exhausted repair, or transport error degrades to the deterministic fallback,
// which always yields 100% hunk coverage.

import { filterFilesForLlm, formatDiffForLlm, parseUnifiedDiff } from "@folio/diff";
import type { ChapterEmit, Prologue, PullRequestFile } from "@folio/types";
import { assembleChapters } from "./assemble.js";
import { fitsInOneChunk, mergeChunkChapters, splitIntoChunks } from "./chunking.js";
import { type ChapterClient, createCodexClient } from "./client.js";
import { type ResolvedConfig, resolveConfig } from "./config.js";
import { coverageOf, isFullyCovered } from "./coverage.js";
import { buildFallbackChapters } from "./fallback.js";
import {
  type CatchAllChapter,
  buildExcludedChanges,
  buildLeftoverChanges,
} from "./other-changes.js";
import { buildFallbackPrologue } from "./prologue.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { runRepairLoop } from "./repair.js";
import { type AgentOutput, AgentOutputSchema } from "./schema.js";
import type { DecompositionInput, DecompositionOptions, DecompositionResult } from "./types.js";

/** Test seam: supply a stub client instead of the real Codex SDK. */
export interface DecomposeDeps {
  clientFactory?: (config: ResolvedConfig) => ChapterClient;
}

function countHunks(files: PullRequestFile[]): number {
  let n = 0;
  for (const f of files) {
    n += f.hunks.length;
  }
  return n;
}

/** Build the excluded-files catch-all from the full + reviewable file split. */
function excludedBucket(
  allFiles: PullRequestFile[],
  excludedByPath: string[],
): CatchAllChapter | null {
  return buildExcludedChanges(allFiles, excludedByPath);
}

/**
 * Pure deterministic decomposition (no LLM). Used directly by the harness
 * `--no-llm`, by the tiny-PR / llm-off short-circuit, and as the universal
 * fallback. Always 100% covered.
 */
export function decomposeDeterministic(
  input: DecompositionInput,
  opts: DecompositionOptions = {},
): DecompositionResult {
  const config = resolveConfig(opts);
  const allFiles = parseUnifiedDiff(input.diff);
  const { files: reviewable, excludedByPath } = filterFilesForLlm(allFiles);

  const emitChapters = buildFallbackChapters(reviewable, config.singleChapterHunkThreshold);
  const catchAll = excludedBucket(allFiles, excludedByPath);
  const chapters = assembleChapters(emitChapters, catchAll);
  const prologue: Prologue =
    reviewable.length > 0 ? buildFallbackPrologue(input, reviewable) : emptyPrologue();

  return { chapters, prologue, source: "fallback", modelUsed: "" };
}

function emptyPrologue(): Prologue {
  return {
    motivation: null,
    outcome: null,
    diagram: null,
    keyChanges: [
      { summary: "No reviewable changes", description: "Only excluded files were touched." },
      { summary: "Deterministic decomposition", description: "Produced without a model pass." },
    ],
    focusAreas: [
      {
        type: "architecture",
        severity: "info",
        title: "Excluded-only change",
        description:
          "Only lockfiles/generated files changed — verify they match the source change.",
        locations: [],
      },
    ],
    complexity: { level: "low", reasoning: "No reviewable source hunks." },
  };
}

/**
 * Main entry. Attempts the LLM path and degrades to the deterministic fallback
 * on any failure. Never throws a coverage error to the caller.
 */
export async function decompose(
  input: DecompositionInput,
  opts: DecompositionOptions = {},
  deps: DecomposeDeps = {},
): Promise<DecompositionResult> {
  const config = resolveConfig(opts);
  const allFiles = parseUnifiedDiff(input.diff);
  const { files: reviewable, excludedByPath } = filterFilesForLlm(allFiles);
  const catchAll = excludedBucket(allFiles, excludedByPath);
  const reviewableHunks = countHunks(reviewable);

  // No reviewable hunks, or tiny PR, or LLM disabled → deterministic path.
  const llmOff = !config.llmEnabled && !deps.clientFactory;
  if (reviewableHunks === 0 || reviewableHunks <= config.singleChapterHunkThreshold || llmOff) {
    return decomposeDeterministic(input, opts);
  }

  try {
    const client = (deps.clientFactory ?? createCodexClient)(config);
    const { output, repaired } = await runLlm(input, reviewable, client, config, opts.signal);

    const merged = ensureFullCoverage(output.chapters, reviewable);
    const chapters = assembleChapters(merged, catchAll);
    const prologue: Prologue = output.prologue ?? buildFallbackPrologue(input, reviewable);

    return {
      chapters,
      prologue,
      source: repaired ? "llm-repaired" : "llm",
      modelUsed: client.model,
    };
  } catch {
    // Any LLM / validation / transport failure → deterministic fallback.
    return decomposeDeterministic(input, opts);
  }
}

/**
 * Run the LLM path: single call or chunked proposals, then the repair loop. On
 * the chunked path each chunk is proposed independently and merged; the repair
 * loop runs once over the full merged set against the full reviewable diff.
 */
async function runLlm(
  input: DecompositionInput,
  reviewable: PullRequestFile[],
  client: ChapterClient,
  config: ResolvedConfig,
  signal: AbortSignal | undefined,
): Promise<{ output: AgentOutput; repaired: boolean }> {
  if (fitsInOneChunk(reviewable, config.maxDiffChars)) {
    const userPrompt = buildPromptFor(input, reviewable);
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

  // Chunked path: propose per chunk, merge, then repair against the full diff.
  const chunks = splitIntoChunks(reviewable, config.maxDiffChars);
  const perChunk: ChapterEmit[][] = [];
  for (const chunk of chunks) {
    const userPrompt = buildPromptFor(input, chunk.files);
    const raw = await client.emitChapters({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      signal,
    });
    const parsed = AgentOutputSchema.safeParse(raw);
    perChunk.push(parsed.success ? parsed.data.chapters : []);
  }
  const merged = mergeChunkChapters(perChunk);

  // Re-validate the merged set; repair against the FULL reviewable diff using a
  // prompt that contains the whole diff so the model can correct cross-chunk gaps.
  const fullPrompt = buildPromptFor(input, reviewable, config.maxDiffChars);
  return runRepairLoop(
    { chapters: merged },
    {
      client,
      system: SYSTEM_PROMPT,
      userPrompt: fullPrompt,
      files: reviewable,
      maxRepairAttempts: config.maxRepairAttempts,
      signal,
    },
  );
}

function buildPromptFor(
  input: DecompositionInput,
  files: PullRequestFile[],
  maxChars: number = Number.POSITIVE_INFINITY,
): string {
  const formatted = formatDiffForLlm(files, { maxChars }).text;
  return buildUserPrompt(input, formatted);
}

/**
 * Guarantee full coverage of the merged chapter set against `reviewable`. Any
 * still-unassigned hunk is swept into a leftover "Other changes" chapter so the
 * engine never returns a partial cover. Throws on extra/duplicate refs (caller
 * catches → fallback) since those signal a genuinely bad output we won't ship.
 */
function ensureFullCoverage(chapters: ChapterEmit[], reviewable: PullRequestFile[]): ChapterEmit[] {
  const report = coverageOf(reviewable, chapters);
  if (isFullyCovered(report)) {
    return chapters;
  }
  if (report.extra.length > 0 || report.duplicates.length > 0) {
    throw new Error("Merged chapters contain extra or duplicate hunk refs");
  }
  // Only missing hunks remain → sweep them into a leftover chapter.
  const leftover = buildLeftoverChanges(report.missing);
  if (!leftover) {
    return chapters;
  }
  const order = chapters.length + 1;
  return [
    ...chapters,
    {
      id: `chapter-${order}`,
      order,
      title: leftover.title,
      summary: leftover.summary,
      hunkRefs: leftover.hunkRefs,
      keyChanges: [],
    },
  ];
}

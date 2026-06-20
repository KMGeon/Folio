// Large-diff handling. When the formatted diff exceeds `maxDiffChars`, split the
// reviewable files into chunks small enough to fit, run one `emit_chapters`
// proposal per chunk, then MERGE the per-chunk chapters into a single set and
// renumber `order`. The orchestrator runs ONE final coverage validation over the
// merged set (issue E2 §chunking).

import { formatDiffForLlm } from "@folio/diff";
import type { ChapterEmit, PullRequestFile } from "@folio/types";

export interface DiffChunk {
  files: PullRequestFile[];
  /** Formatted `=== HUNKS ===` text for just this chunk. */
  formatted: string;
}

/**
 * Greedily pack files into chunks whose formatted size stays under `maxChars`.
 * A single file larger than the budget becomes its own (over-budget) chunk —
 * we never split a file's hunks across chunks, so hunk refs stay coherent.
 */
export function splitIntoChunks(files: PullRequestFile[], maxChars: number): DiffChunk[] {
  if (files.length === 0) {
    return [];
  }

  const chunks: DiffChunk[] = [];
  let current: PullRequestFile[] = [];

  const flush = () => {
    if (current.length === 0) {
      return;
    }
    chunks.push({
      files: current,
      formatted: formatDiffForLlm(current, { maxChars: Number.POSITIVE_INFINITY }).text,
    });
    current = [];
  };

  for (const file of files) {
    const candidate = [...current, file];
    const size = formatDiffForLlm(candidate, {
      maxChars: Number.POSITIVE_INFINITY,
    }).text.length;
    if (size > maxChars && current.length > 0) {
      flush();
      current = [file];
    } else {
      current = candidate;
    }
  }
  flush();
  return chunks;
}

/** True when the whole formatted diff fits in one prompt. */
export function fitsInOneChunk(files: PullRequestFile[], maxChars: number): boolean {
  const size = formatDiffForLlm(files, { maxChars: Number.POSITIVE_INFINITY }).text.length;
  return size <= maxChars;
}

/**
 * Merge per-chunk emit chapters into one ordered set: concatenate in chunk
 * order, re-assign stable unique ids, and renumber `order` 1..N. Hunk refs are
 * preserved verbatim so the merged set still maps onto the full diff for a
 * single coverage check.
 */
export function mergeChunkChapters(perChunk: ChapterEmit[][]): ChapterEmit[] {
  const merged: ChapterEmit[] = [];
  let order = 1;
  for (const chapters of perChunk) {
    for (const chapter of chapters) {
      merged.push({
        ...chapter,
        id: `chapter-${order}`,
        order,
      });
      order += 1;
    }
  }
  return merged;
}

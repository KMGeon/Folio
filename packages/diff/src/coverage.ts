import type { HunkReference, PullRequestFile } from "@folio/types";

/** A chapter-like object carrying the hunk refs it claims. */
export interface ChapterHunkRefs {
  hunkRefs: HunkReference[];
}

export interface CoverageReport {
  missing: HunkReference[];
  extra: HunkReference[];
  duplicates: HunkReference[];
}

/**
 * Thrown by `validateHunkCoverage` when the chapter assignment does not cover
 * every diff hunk exactly once. `message` is a human-readable missing / extra /
 * duplicate report E2 forwards to the agent for retry.
 */
export class HunkCoverageError extends Error {
  readonly missing: HunkReference[];
  readonly extra: HunkReference[];
  readonly duplicates: HunkReference[];

  constructor(report: CoverageReport) {
    super(formatCoverageMessage(report));
    this.name = "HunkCoverageError";
    this.missing = report.missing;
    this.extra = report.extra;
    this.duplicates = report.duplicates;
    // Restore prototype chain for instanceof under transpiled targets.
    Object.setPrototypeOf(this, HunkCoverageError.prototype);
  }
}

function refLine(ref: HunkReference): string {
  return `  filePath: "${ref.filePath}", oldStart: ${ref.oldStart}`;
}

function formatCoverageMessage(report: CoverageReport): string {
  const lines = ["Hunk coverage validation failed."];
  if (report.missing.length > 0) {
    lines.push(`Missing hunks (${report.missing.length}) — not assigned to any chapter:`);
    lines.push(...report.missing.map(refLine));
  }
  if (report.extra.length > 0) {
    lines.push(`Extra hunks (${report.extra.length}) — not found in the diff:`);
    lines.push(...report.extra.map(refLine));
  }
  if (report.duplicates.length > 0) {
    lines.push(`Duplicate hunks (${report.duplicates.length}) — assigned to multiple chapters:`);
    lines.push(...report.duplicates.map(refLine));
  }
  return lines.join("\n");
}

/**
 * Compute a coverage report comparing the diff's expected hunks (keyed by
 * `(filePath, oldStart)`) against the chapters' claimed hunk refs.
 *
 * - `missing`: in the diff but not assigned to any chapter.
 * - `extra`: assigned by a chapter but not present in the diff.
 * - `duplicates`: the same `(filePath, oldStart)` assigned more than once.
 */
export function computeCoverage(
  files: PullRequestFile[],
  chapters: ChapterHunkRefs[],
): CoverageReport {
  const expected = new Map<string, Set<number>>();
  for (const file of files) {
    const starts = new Set<number>();
    for (const hunk of file.hunks) {
      starts.add(hunk.oldStart);
    }
    if (starts.size > 0) {
      expected.set(file.path, starts);
    }
  }

  const actual = new Map<string, Map<number, number>>();
  const duplicates: HunkReference[] = [];
  for (const chapter of chapters) {
    for (const ref of chapter.hunkRefs) {
      let starts = actual.get(ref.filePath);
      if (!starts) {
        starts = new Map();
        actual.set(ref.filePath, starts);
      }
      const count = starts.get(ref.oldStart) ?? 0;
      if (count > 0) {
        duplicates.push({ filePath: ref.filePath, oldStart: ref.oldStart });
      }
      starts.set(ref.oldStart, count + 1);
    }
  }

  const missing: HunkReference[] = [];
  for (const [filePath, starts] of expected) {
    const actualStarts = actual.get(filePath);
    for (const oldStart of starts) {
      if (!actualStarts?.has(oldStart)) {
        missing.push({ filePath, oldStart });
      }
    }
  }

  const extra: HunkReference[] = [];
  for (const [filePath, starts] of actual) {
    const expectedStarts = expected.get(filePath);
    for (const oldStart of starts.keys()) {
      if (!expectedStarts?.has(oldStart)) {
        extra.push({ filePath, oldStart });
      }
    }
  }

  return { missing, extra, duplicates };
}

/**
 * Throw `HunkCoverageError` unless every diff hunk is assigned to exactly one
 * chapter. Returns silently on full, non-duplicated coverage.
 */
export function validateHunkCoverage(files: PullRequestFile[], chapters: ChapterHunkRefs[]): void {
  const report = computeCoverage(files, chapters);
  if (report.missing.length === 0 && report.extra.length === 0 && report.duplicates.length === 0) {
    return;
  }
  throw new HunkCoverageError(report);
}

/**
 * Non-throwing helper: the list of diff hunks not assigned to any chapter
 * (i.e. the `missing` set of `computeCoverage`).
 */
export function findUnassignedHunks(
  files: PullRequestFile[],
  chapters: ChapterHunkRefs[],
): HunkReference[] {
  return computeCoverage(files, chapters).missing;
}

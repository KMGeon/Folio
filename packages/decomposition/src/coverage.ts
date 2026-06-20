// Coverage validation, thin wrapper over @folio/diff's `computeCoverage`. Turns
// the {missing, extra, duplicates} report into a human-readable block the repair
// prompt feeds back to Claude ("here is exactly what you got wrong, fix it").

import { type CoverageReport, computeCoverage } from "@folio/diff";
import type { HunkReference, PullRequestFile } from "@folio/types";

export type { CoverageReport } from "@folio/diff";
export { computeCoverage, validateHunkCoverage } from "@folio/diff";

interface HasHunkRefs {
  hunkRefs: HunkReference[];
}

/** True when every diff hunk is assigned to exactly one chapter. */
export function isFullyCovered(report: CoverageReport): boolean {
  return report.missing.length === 0 && report.extra.length === 0 && report.duplicates.length === 0;
}

/** Compute coverage of `chapters` against the parsed `files`. */
export function coverageOf(files: PullRequestFile[], chapters: HasHunkRefs[]): CoverageReport {
  return computeCoverage(files, chapters);
}

function listRefs(refs: HunkReference[]): string {
  return refs.map((r) => `  - filePath: "${r.filePath}", oldStart: ${r.oldStart}`).join("\n");
}

/**
 * Render the report as a corrective instruction block for the repair prompt.
 * Empty sections are omitted. Returns "" when fully covered.
 */
export function formatCoverageFeedback(report: CoverageReport): string {
  if (isFullyCovered(report)) {
    return "";
  }
  const sections: string[] = [
    "Your previous chapters failed hunk-coverage validation. Fix EXACTLY these problems and resubmit by calling emit_chapters again:",
  ];
  if (report.missing.length > 0) {
    sections.push(
      `MISSING — these hunks exist in the diff but you assigned them to NO chapter. Add each to exactly one chapter:\n${listRefs(report.missing)}`,
    );
  }
  if (report.extra.length > 0) {
    sections.push(
      `EXTRA — these hunkRefs do NOT exist in the diff. Remove them (you invented or mistyped them):\n${listRefs(report.extra)}`,
    );
  }
  if (report.duplicates.length > 0) {
    sections.push(
      `DUPLICATE — these hunks were assigned to MORE THAN ONE chapter. Keep each in exactly one:\n${listRefs(report.duplicates)}`,
    );
  }
  sections.push(
    "Keep every other hunk assignment as-is. Every (filePath, oldStart) hunk must end up in exactly one chapter.",
  );
  return sections.join("\n\n");
}

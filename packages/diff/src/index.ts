// @folio/diff — pure functions to parse, format, filter, and coverage-check
// unified diffs for the decomposition engine. No network / git I/O; the only
// fs access is `loadFolioIgnore` reading `.folioignore`.

export { calculateDiffStats, parseGitDiff, parseUnifiedDiff } from "./parse.js";
export {
  countHunkLines,
  type FormatDiffOptions,
  type FormatDiffResult,
  formatDiffForLlm,
  formatHunkDiff,
  formatHunkDiffWithLineNumbers,
} from "./format.js";
export {
  type FilterFilesResult,
  filterFilesForLlm,
  loadFolioIgnore,
  shouldIncludeFile,
} from "./filter.js";
export { buildOtherChangesChapter, type OtherChangesChapter } from "./other-changes.js";
export {
  type ChapterHunkRefs,
  computeCoverage,
  type CoverageReport,
  findUnassignedHunks,
  HunkCoverageError,
  validateHunkCoverage,
} from "./coverage.js";
export { MAX_DIFF_CHARS, type TruncateResult, truncateForLlm } from "./truncate.js";

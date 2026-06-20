import type { HunkReference, PullRequestFile } from "@folio/types";

const OTHER_CHANGES_CHAPTER_ID = "chapter-other-changes";
const OTHER_CHANGES_TITLE = "Other changes";
const OTHER_CHANGES_SUMMARY =
  "Lockfiles, generated files, and binary assets excluded from the chapters.";

export interface OtherChangesChapter {
  id: string;
  title: string;
  summary: string;
  hunkRefs: HunkReference[];
  keyChanges: [];
}

/**
 * Collect the hunks of excluded files into a deterministic "Other changes"
 * bucket. Returns `null` when nothing was excluded. The bucket covers exactly
 * one `HunkReference` per excluded-file hunk, keyed by `(filePath, oldStart)`.
 */
export function buildOtherChangesChapter(
  allFiles: PullRequestFile[],
  excludedByPath: string[],
): OtherChangesChapter | null {
  if (excludedByPath.length === 0) {
    return null;
  }

  const excluded = new Set(excludedByPath);
  const hunkRefs: HunkReference[] = [];

  for (const file of allFiles) {
    if (!excluded.has(file.path)) {
      continue;
    }
    for (const hunk of file.hunks) {
      hunkRefs.push({ filePath: file.path, oldStart: hunk.oldStart });
    }
  }

  return {
    id: OTHER_CHANGES_CHAPTER_ID,
    title: OTHER_CHANGES_TITLE,
    summary: OTHER_CHANGES_SUMMARY,
    hunkRefs,
    keyChanges: [],
  };
}

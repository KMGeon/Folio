// Deterministic, no-LLM decomposition. Used for tiny PRs, when the LLM path is
// disabled (FOLIO_DECOMP_LLM=0), and when the LLM path + repair loop are exhausted.
// It ALWAYS covers 100% of reviewable hunks exactly once.
//
// Strategy precedence (issue E2 §fallback):
//   1. tiny-PR rule  — <= threshold reviewable hunks → ONE chapter.
//   2. directory/module grouping — group hunks by top-level directory.
//   3. file-type buckets — fall out of (2) naturally via the directory key,
//      with tests/config kept legible by their path.
//
// Commit-boundary grouping is only meaningful when a commit→hunk mapping is
// available; a unified diff carries no such mapping, so we expose the hook but
// default to directory grouping. // TODO(E2): wire commit→hunk mapping from G1.

import type { ChapterEmit, HunkReference, PullRequestFile } from "@folio/types";

/** All `(filePath, oldStart)` hunk refs for a set of files, in file order. */
export function collectHunkRefs(files: PullRequestFile[]): HunkReference[] {
  const refs: HunkReference[] = [];
  for (const file of files) {
    for (const hunk of file.hunks) {
      refs.push({ filePath: file.path, oldStart: hunk.oldStart });
    }
  }
  return refs;
}

function countHunks(files: PullRequestFile[]): number {
  let n = 0;
  for (const file of files) {
    n += file.hunks.length;
  }
  return n;
}

/** Top-level directory of a path, or "(root)" for top-level files. */
function topDir(filePath: string): string {
  const slash = filePath.indexOf("/");
  return slash === -1 ? "(root)" : filePath.slice(0, slash);
}

function titleForGroup(key: string): string {
  if (key === "(root)") {
    return "Update root-level files";
  }
  return `Update ${key}`;
}

function makeChapter(
  order: number,
  title: string,
  summary: string,
  hunkRefs: HunkReference[],
): ChapterEmit {
  return {
    id: `chapter-${order}`,
    order,
    title,
    summary,
    hunkRefs,
    keyChanges: [],
  };
}

/**
 * Build deterministic emit chapters for the reviewable files. Returns `[]` only
 * when there are no hunks at all.
 */
export function buildFallbackChapters(
  files: PullRequestFile[],
  singleChapterHunkThreshold: number,
): ChapterEmit[] {
  const total = countHunks(files);
  if (total === 0) {
    return [];
  }

  // 1. Tiny-PR rule → a single chapter covering everything.
  if (total <= singleChapterHunkThreshold) {
    return [
      makeChapter(
        1,
        "Apply changes",
        "All changes in this pull request, grouped into a single chapter.",
        collectHunkRefs(files),
      ),
    ];
  }

  // 2. Directory/module grouping (file-type buckets fall out of the key).
  const groups = new Map<string, PullRequestFile[]>();
  for (const file of files) {
    const key = topDir(file.path);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(file);
    } else {
      groups.set(key, [file]);
    }
  }

  const sortedKeys = [...groups.keys()].sort();
  const chapters: ChapterEmit[] = [];
  let order = 1;
  for (const key of sortedKeys) {
    const groupFiles = groups.get(key) ?? [];
    const refs = collectHunkRefs(groupFiles);
    if (refs.length === 0) {
      continue;
    }
    const fileCount = groupFiles.length;
    chapters.push(
      makeChapter(
        order,
        titleForGroup(key),
        `Changes under \`${key}\` (${fileCount} file${fileCount === 1 ? "" : "s"}).`,
        refs,
      ),
    );
    order += 1;
  }

  return chapters;
}

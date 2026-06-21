// Deterministic, no-LLM decomposition. Used when the LLM path is disabled
// (FOLIO_DECOMP_LLM=0) and when the LLM path + repair loop are exhausted.
// It ALWAYS covers 100% of reviewable hunks exactly once.
//
// Strategy precedence (issue E2 §fallback):
//   1. file-work stages — each changed file gets an explicit review stage.
//   2. grouped companion files can be added later when the relationship is
//      unambiguous, but the fallback must never hide work behind "Apply changes".
//
// Commit-boundary grouping is only meaningful when a commit→hunk mapping is
// available; a unified diff carries no such mapping, so fallback stays file-based.

import { FILE_STATUS } from "@folio/types";
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

function statusAction(file: PullRequestFile): string {
  switch (file.status) {
    case FILE_STATUS.ADDED:
      return "추가";
    case FILE_STATUS.DELETED:
      return "삭제";
    case FILE_STATUS.RENAMED:
    case FILE_STATUS.MOVED:
      return "이동";
    case FILE_STATUS.MODIFIED:
      return "수정";
  }
}

function titleForFile(file: PullRequestFile): string {
  return `${file.path} ${statusAction(file)}`;
}

function summaryForFile(file: PullRequestFile): string {
  const hunkCount = file.hunks.length;
  return [
    `\`${file.path}\` 파일의 ${statusAction(file)} 작업입니다.`,
    `변경된 hunk ${hunkCount}개를 이 Stage에서 확인합니다.`,
  ].join(" ");
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
  _singleChapterHunkThreshold: number,
): ChapterEmit[] {
  const total = countHunks(files);
  if (total === 0) {
    return [];
  }

  // File-stage fallback: even a one-hunk PR should say which file's work is being reviewed.
  const chapters: ChapterEmit[] = [];
  for (const file of files) {
    const refs = collectHunkRefs([file]);
    if (refs.length === 0) {
      continue;
    }
    const order = chapters.length + 1;
    chapters.push(makeChapter(order, titleForFile(file), summaryForFile(file), refs));
  }

  return chapters;
}

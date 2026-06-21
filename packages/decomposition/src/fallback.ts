// Deterministic, no-LLM decomposition. Used when the LLM path is disabled
// (FOLIO_DECOMP_LLM=0) and when the LLM path + repair loop are exhausted.
// It ALWAYS covers 100% of reviewable hunks exactly once.
//
// Strategy precedence:
//   1. task-area stages — group related files by feature/config/domain area.
//   2. keep hunk coverage exact even when the grouping is necessarily heuristic.
//
// Commit-boundary grouping is only meaningful when a commit→hunk mapping is
// available; a unified diff carries no such mapping, so fallback uses path signals.

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

interface TaskArea {
  key: string;
  title: string;
  priority: number;
}

function topDir(filePath: string): string {
  const slash = filePath.indexOf("/");
  return slash === -1 ? "(root)" : filePath.slice(0, slash);
}

function taskAreaForPath(filePath: string): TaskArea {
  if (/^(?:package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(filePath)) {
    return { key: "dependencies", title: "의존성 설정 수정", priority: 10 };
  }
  if (/^(?:docker-compose|Dockerfile|nginx\/|\.github\/workflows\/)/.test(filePath)) {
    return { key: "deploy", title: "배포 설정 수정", priority: 15 };
  }
  if (/^(?:packages\/db\/|.*\/drizzle\/|.*\/schema\/)/.test(filePath)) {
    return { key: "database", title: "DB 스키마 수정", priority: 20 };
  }
  if (/(?:^|\/)(?:auth|session|oauth|login)(?:\/|\.|-)/.test(filePath)) {
    return { key: "auth", title: "인증 흐름 수정", priority: 30 };
  }
  if (filePath.startsWith("apps/web/")) {
    return { key: "web-ui", title: "웹 화면 수정", priority: 50 };
  }
  if (filePath.startsWith("apps/backend/")) {
    return { key: "backend", title: "백엔드 로직 수정", priority: 40 };
  }
  if (/^(?:docs\/|README\.md|AGENTS\.md)/.test(filePath)) {
    return { key: "docs", title: "문서 수정", priority: 80 };
  }

  const dir = topDir(filePath);
  return { key: `dir:${dir}`, title: `${dir} 작업 수정`, priority: 60 };
}

function summaryForTask(title: string, files: PullRequestFile[]): string {
  const hunkCount = countHunks(files);
  const fileList = files.map((file) => `\`${file.path}\``).join(", ");
  return [
    `${title}에 관련된 변경을 묶었습니다.`,
    `${files.length}개 파일, hunk ${hunkCount}개를 이 Stage에서 확인합니다: ${fileList}.`,
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

  // Task-area fallback: coarse enough to avoid a file list, strict enough to keep coverage.
  const groups = new Map<
    string,
    {
      area: TaskArea;
      files: PullRequestFile[];
      firstIndex: number;
    }
  >();
  for (const file of files) {
    const area = taskAreaForPath(file.path);
    const group = groups.get(area.key);
    if (group) {
      group.files.push(file);
    } else {
      groups.set(area.key, { area, files: [file], firstIndex: groups.size });
    }
  }

  const orderedGroups = [...groups.values()].sort(
    (a, b) => a.area.priority - b.area.priority || a.firstIndex - b.firstIndex,
  );
  const chapters: ChapterEmit[] = [];
  for (const group of orderedGroups) {
    const refs = collectHunkRefs(group.files);
    if (refs.length === 0) {
      continue;
    }
    const title = group.area.title;
    const order = chapters.length + 1;
    chapters.push(makeChapter(order, title, summaryForTask(title, group.files), refs));
  }

  return chapters;
}

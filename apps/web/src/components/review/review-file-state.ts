import type { ReviewChapter, ReviewChapterFile, ReviewDiffLine } from "@/lib/review-api";

export interface FileDiffGroup {
  file: ReviewChapterFile;
  lines: ReviewDiffLine[];
}

export type CollapsedFileState = Record<string, boolean>;

export function viewedFileCollapseState(chapters: ReviewChapter[]): CollapsedFileState {
  return Object.fromEntries(
    chapters.flatMap((chapter) =>
      chapter.files.filter((file) => file.viewed).map((file) => [file.path, true]),
    ),
  );
}

export function setFilePathsCollapsed(
  current: CollapsedFileState,
  paths: string[],
  collapsed: boolean,
): CollapsedFileState {
  const next = { ...current };
  for (const path of paths) {
    next[path] = collapsed;
  }
  return next;
}

export function areFilePathsCollapsed(state: CollapsedFileState, paths: string[]): boolean {
  return paths.length > 0 && paths.every((path) => state[path]);
}

export function fileProgress(files: ReviewChapterFile[]): { viewed: number; total: number } {
  return {
    viewed: files.filter((file) => file.viewed).length,
    total: files.length,
  };
}

export function groupLinesByFile(chapter: ReviewChapter): FileDiffGroup[] {
  return chapter.files.map((file) => ({
    file,
    lines: chapter.diffLines.filter((line) => line.path === file.path),
  }));
}

export function filePanelId(chapterIndex: number, path: string): string {
  return `chapter-${chapterIndex}-file-${encodeURIComponent(path).replaceAll("%", "-")}`;
}

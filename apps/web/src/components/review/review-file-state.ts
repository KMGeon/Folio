import type { ReviewChapter, ReviewChapterFile, ReviewDiffLine } from "@/lib/review-api";

export interface FileDiffGroup {
  file: ReviewChapterFile;
  lines: ReviewDiffLine[];
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

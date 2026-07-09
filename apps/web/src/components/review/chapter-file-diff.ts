import type { ReviewChapter } from "@/lib/review-api";

export function buildFileScopedChapter(chapter: ReviewChapter, path: string): ReviewChapter {
  return {
    ...chapter,
    files: chapter.files.filter((file) => file.path === path),
    diffLines: chapter.diffLines.filter((line) => line.path === path),
  };
}

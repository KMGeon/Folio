import type { ReviewChapter, ReviewFileStatus } from "@/lib/review-api";

export interface ChangedFile {
  path: string;
  status: ReviewFileStatus;
  additions: number;
  deletions: number;
  chapterIndex: number;
  chapterTitle: string;
}

/** Aggregate every chapter's files into a deduped changed-file list for the Files tab. */
export function aggregateChangedFiles(chapters: ReviewChapter[]): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();
  for (const chapter of chapters) {
    for (const file of chapter.files) {
      const existing = byPath.get(file.path);
      if (existing) {
        existing.additions += file.additions;
        existing.deletions += file.deletions;
      } else {
        byPath.set(file.path, {
          path: file.path,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          chapterIndex: chapter.index,
          chapterTitle: chapter.title,
        });
      }
    }
  }
  return [...byPath.values()];
}

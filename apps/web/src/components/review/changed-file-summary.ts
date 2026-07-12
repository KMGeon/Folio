import type { ReviewChapter, ReviewFileStatus } from "@/lib/review-api";

export interface ChangedFile {
  path: string;
  status: ReviewFileStatus;
  additions: number;
  deletions: number;
  viewed: boolean;
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
          viewed: file.viewed,
          chapterIndex: chapter.index,
          chapterTitle: chapter.title,
        });
      }
      if (existing) {
        existing.viewed = existing.viewed || file.viewed;
      }
    }
  }
  return [...byPath.values()];
}

/** Case-insensitive path filter for the Files tab query box. */
export function filterChangedFiles(files: ChangedFile[], query: string): ChangedFile[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return files;
  }
  return files.filter((file) => file.path.toLocaleLowerCase().includes(normalized));
}

/**
 * Keep the selected file path inside the filtered list.
 * Returns the current path when still visible; otherwise the first visible path.
 */
export function resolveSelectedFilePath(
  files: ChangedFile[],
  query: string,
  selectedPath: string | null,
): string | null {
  const visible = filterChangedFiles(files, query);
  if (visible.length === 0) {
    return null;
  }
  if (selectedPath && visible.some((file) => file.path === selectedPath)) {
    return selectedPath;
  }
  return visible[0]?.path ?? null;
}

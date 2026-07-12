import type { ReviewChapter } from "@/lib/review-api";

/** PR-level chapter milestone progress (source of truth for top bar primary). */
export function chapterMilestoneProgress(chapters: Pick<ReviewChapter, "viewed">[]): {
  done: number;
  total: number;
} {
  return {
    done: chapters.filter((chapter) => chapter.viewed).length,
    total: chapters.length,
  };
}

/** In-chapter focus + file coverage for the side panel summary line. */
export function chapterLocalProgress(chapter: ReviewChapter): {
  focusDone: number;
  focusTotal: number;
  filesDone: number;
  filesTotal: number;
  /** True when every focus item is judged, or there is nothing to judge. */
  focusComplete: boolean;
} {
  const focusTotal = chapter.keyChanges.length;
  const focusDone = chapter.keyChanges.filter((item) => item.viewed).length;
  const filesTotal = chapter.files.length;
  const filesDone = chapter.files.filter((file) => file.viewed).length;
  return {
    focusDone,
    focusTotal,
    filesDone,
    filesTotal,
    focusComplete: focusTotal === 0 || focusDone === focusTotal,
  };
}

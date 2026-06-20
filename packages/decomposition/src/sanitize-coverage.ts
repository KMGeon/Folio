// Graceful coverage repair. When the LLM's chapters fail hunk-coverage after the
// bounded repair loop, we keep their structure + narration instead of discarding
// everything to the deterministic fallback: drop invalid/duplicate hunkRefs and
// sweep any unassigned hunks into a leftover chapter. ALWAYS yields full coverage.

import type { ChapterEmit, HunkReference, PullRequestFile } from "@folio/types";
import { collectHunkRefs } from "./fallback.js";
import { buildLeftoverChanges } from "./other-changes.js";

function refKey(r: HunkReference): string {
  return `${r.filePath}:${r.oldStart}`;
}

export function sanitizeChapters(
  chapters: ChapterEmit[],
  reviewable: PullRequestFile[],
): ChapterEmit[] {
  const valid = new Set(collectHunkRefs(reviewable).map(refKey));
  const seen = new Set<string>();

  const kept: ChapterEmit[] = [];
  for (const chapter of chapters) {
    const refs: HunkReference[] = [];
    for (const ref of chapter.hunkRefs) {
      const key = refKey(ref);
      // Drop refs that aren't real hunks (extra) or already taken (duplicate).
      if (!valid.has(key) || seen.has(key)) {
        continue;
      }
      seen.add(key);
      refs.push(ref);
    }
    if (refs.length > 0) {
      kept.push({ ...chapter, hunkRefs: refs });
    }
  }

  // Sweep any valid hunk no chapter claimed into one leftover chapter.
  const missing = collectHunkRefs(reviewable).filter((r) => !seen.has(refKey(r)));
  const leftover = buildLeftoverChanges(missing);
  if (leftover) {
    kept.push({
      id: leftover.id,
      order: 0,
      title: leftover.title,
      summary: leftover.summary,
      hunkRefs: leftover.hunkRefs,
      keyChanges: [],
    });
  }

  // Renumber order + id sequentially after drops/additions.
  return kept.map((c, i) => ({ ...c, id: `chapter-${i + 1}`, order: i + 1 }));
}

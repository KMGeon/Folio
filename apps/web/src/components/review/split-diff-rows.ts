import type { ReviewDiffLine } from "@/lib/review-api";

export interface SplitDiffRow {
  oldLine: ReviewDiffLine | null;
  newLine: ReviewDiffLine | null;
}

export function buildSplitDiffRows(lines: ReviewDiffLine[]): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.kind === "ctx") {
      rows.push({ oldLine: line, newLine: line });
      index += 1;
      continue;
    }

    if (line.kind === "del") {
      const deletions: ReviewDiffLine[] = [];
      const additions: ReviewDiffLine[] = [];

      while (lines[index]?.kind === "del") {
        deletions.push(lines[index]);
        index += 1;
      }

      while (lines[index]?.kind === "add") {
        additions.push(lines[index]);
        index += 1;
      }

      const count = Math.max(deletions.length, additions.length);
      for (let offset = 0; offset < count; offset += 1) {
        rows.push({
          oldLine: deletions[offset] ?? null,
          newLine: additions[offset] ?? null,
        });
      }
      continue;
    }

    rows.push({ oldLine: null, newLine: line });
    index += 1;
  }

  return rows;
}

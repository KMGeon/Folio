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
    if (!line) {
      break;
    }

    if (line.kind === "ctx") {
      rows.push({ oldLine: line, newLine: line });
      index += 1;
      continue;
    }

    if (line.kind === "del") {
      const deletions: ReviewDiffLine[] = [];
      const additions: ReviewDiffLine[] = [];

      let current = lines[index];
      while (current?.kind === "del") {
        deletions.push(current);
        index += 1;
        current = lines[index];
      }

      current = lines[index];
      while (current?.kind === "add") {
        additions.push(current);
        index += 1;
        current = lines[index];
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

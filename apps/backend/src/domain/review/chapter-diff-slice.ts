import { parseUnifiedDiff } from "@folio/diff";
import type { DiffLine, Hunk, HunkReference, PullRequestFile } from "@folio/types";
import type { ChapterCode, WebChapterFile, WebDiffLine } from "./review-read-model.js";

function lineKind(line: DiffLine): WebDiffLine["kind"] {
  if (line.type === "addition") {
    return "add";
  }
  if (line.type === "deletion") {
    return "del";
  }
  return "ctx";
}

function toWebLine(line: DiffLine): WebDiffLine {
  return {
    n: line.newLineNumber ?? line.oldLineNumber ?? 0,
    kind: lineKind(line),
    text: line.content,
  };
}

/**
 * Re-derive a chapter's code from the stored unified diff by matching each
 * hunk ref `(filePath, oldStart)` to its parsed hunk. Unknown refs are skipped
 * so a stale ref never breaks rendering.
 */
export function sliceChapterCode(rawDiff: string, hunkRefs: HunkReference[]): ChapterCode {
  const files: PullRequestFile[] = parseUnifiedDiff(rawDiff);
  const byPath = new Map(files.map((f) => [f.path, f]));

  const touched = new Map<string, WebChapterFile>();
  const diffLines: WebDiffLine[] = [];

  for (const ref of hunkRefs) {
    const file = byPath.get(ref.filePath);
    if (!file) {
      continue;
    }
    const hunk: Hunk | undefined = file.hunks.find((h) => h.oldStart === ref.oldStart);
    if (!hunk) {
      continue;
    }

    const entry = touched.get(file.path) ?? { path: file.path, additions: 0, deletions: 0 };
    for (const line of hunk.lines) {
      if (line.type === "addition") {
        entry.additions += 1;
      }
      if (line.type === "deletion") {
        entry.deletions += 1;
      }
      diffLines.push(toWebLine(line));
    }
    touched.set(file.path, entry);
  }

  return { files: [...touched.values()], diffLines };
}

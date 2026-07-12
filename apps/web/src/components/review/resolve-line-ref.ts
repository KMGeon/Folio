import type { ReviewChapter, ReviewDiffLine, ReviewLineRef } from "@/lib/review-api";

export type ResolvedLineRef = {
  ref: ReviewLineRef;
  line: ReviewDiffLine;
};

export type JumpTarget = {
  chapterIndex: number;
  path: string;
  lineNumber: number;
  kind: ReviewDiffLine["kind"];
  token: number;
};

export function encodeDiffPath(path: string): string {
  return encodeURIComponent(path).replaceAll("%", "-");
}

export function diffLineElementId(chapterIndex: number, line: ReviewDiffLine): string {
  return `diff-line-${chapterIndex}-${encodeDiffPath(line.path)}-${line.kind}-${line.n}`;
}

function lineNumberForSide(line: ReviewDiffLine, side: ReviewLineRef["side"]): number | null {
  if (side === "deletions") {
    if (line.kind !== "del") {
      return null;
    }
    return line.oldLineNumber ?? line.n;
  }
  // additions: any non-deletion row that carries a new-side number
  if (line.kind === "del") {
    return null;
  }
  return line.newLineNumber ?? line.n;
}

export function resolveLineRef(chapter: ReviewChapter, ref: ReviewLineRef): ReviewDiffLine | null {
  for (const line of chapter.diffLines) {
    if (line.path !== ref.filePath) {
      continue;
    }
    const num = lineNumberForSide(line, ref.side);
    if (num === null) {
      continue;
    }
    if (num >= ref.startLine && num <= ref.endLine) {
      return line;
    }
  }
  return null;
}

export function selectFirstResolvableLineRef(
  chapter: ReviewChapter,
  lineRefs: ReviewLineRef[],
): ResolvedLineRef | null {
  for (const ref of lineRefs) {
    const line = resolveLineRef(chapter, ref);
    if (line) {
      return { ref, line };
    }
  }
  return null;
}

export function jumpTargetFromResolved(
  chapterIndex: number,
  resolved: ResolvedLineRef,
  token: number,
): JumpTarget {
  return {
    chapterIndex,
    path: resolved.line.path,
    lineNumber: resolved.line.n,
    kind: resolved.line.kind,
    token,
  };
}

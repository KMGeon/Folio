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

/** Stable identity for a diff row linked from any 검토할 사항 lineRef. */
export type FocusLineMarker = {
  path: string;
  lineNumber: number;
  kind: ReviewDiffLine["kind"];
  keyChangeId: string;
};

/** Every resolvable focus-question line in a chapter — always-on markers in the diff. */
export function collectFocusLineMarkers(chapter: ReviewChapter): FocusLineMarker[] {
  const markers: FocusLineMarker[] = [];
  const seen = new Set<string>();
  for (const keyChange of chapter.keyChanges) {
    for (const ref of keyChange.lineRefs) {
      const line = resolveLineRef(chapter, ref);
      if (!line) {
        continue;
      }
      const id = `${line.path}|${line.kind}|${line.n}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      markers.push({
        path: line.path,
        lineNumber: line.n,
        kind: line.kind,
        keyChangeId: keyChange.id,
      });
    }
  }
  return markers;
}

export function isFocusMarkerLine(
  markers: FocusLineMarker[],
  line: ReviewDiffLine,
): FocusLineMarker | null {
  return (
    markers.find(
      (marker) =>
        marker.path === line.path && marker.kind === line.kind && marker.lineNumber === line.n,
    ) ?? null
  );
}

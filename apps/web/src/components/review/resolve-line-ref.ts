import type { ReviewChapter, ReviewDiffLine, ReviewLineRef } from "@/lib/review-api";

export type ResolvedLineRef = {
  ref: ReviewLineRef;
  line: ReviewDiffLine;
};

/** Active 검토 사항 highlight — full startLine..endLine block(s), not a single row. */
export type JumpTarget = {
  chapterIndex: number;
  token: number;
  ranges: {
    path: string;
    side: ReviewLineRef["side"];
    startLine: number;
    endLine: number;
  }[];
  /** First resolvable row used for scrollIntoView. */
  anchor: {
    path: string;
    kind: ReviewDiffLine["kind"];
    lineNumber: number;
  };
};

export function encodeDiffPath(path: string): string {
  return encodeURIComponent(path).replaceAll("%", "-");
}

export function diffLineElementId(chapterIndex: number, line: ReviewDiffLine): string {
  return `diff-line-${chapterIndex}-${encodeDiffPath(line.path)}-${line.kind}-${line.n}`;
}

export function lineNumberForSide(
  line: ReviewDiffLine,
  side: ReviewLineRef["side"],
): number | null {
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

/** First matching row in a lineRef range (legacy single-line callers / scroll anchor). */
export function resolveLineRef(chapter: ReviewChapter, ref: ReviewLineRef): ReviewDiffLine | null {
  const lines = resolveAllLinesForRef(chapter, ref);
  return lines[0] ?? null;
}

/** Every diff row whose side-number falls inside the lineRef range. */
export function resolveAllLinesForRef(
  chapter: ReviewChapter,
  ref: ReviewLineRef,
): ReviewDiffLine[] {
  const matched: ReviewDiffLine[] = [];
  for (const line of chapter.diffLines) {
    if (line.path !== ref.filePath) {
      continue;
    }
    const num = lineNumberForSide(line, ref.side);
    if (num === null) {
      continue;
    }
    if (num >= ref.startLine && num <= ref.endLine) {
      matched.push(line);
    }
  }
  return matched;
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

/** Build an active jump that highlights every row in every resolvable lineRef range. */
export function jumpTargetFromKeyChange(
  chapter: ReviewChapter,
  keyChange: ReviewChapter["keyChanges"][number],
  token: number,
): JumpTarget | null {
  const ranges: JumpTarget["ranges"] = [];
  let anchor: JumpTarget["anchor"] | null = null;

  for (const ref of keyChange.lineRefs) {
    const lines = resolveAllLinesForRef(chapter, ref);
    if (lines.length === 0) {
      continue;
    }
    ranges.push({
      path: ref.filePath,
      side: ref.side,
      startLine: ref.startLine,
      endLine: ref.endLine,
    });
    if (!anchor) {
      const first = lines[0];
      anchor = {
        path: first.path,
        kind: first.kind,
        lineNumber: first.n,
      };
    }
  }

  if (!anchor || ranges.length === 0) {
    return null;
  }

  return {
    chapterIndex: chapter.index,
    token,
    ranges,
    anchor,
  };
}

/** @deprecated Prefer jumpTargetFromKeyChange for full-range highlights. */
export function jumpTargetFromResolved(
  chapterIndex: number,
  resolved: ResolvedLineRef,
  token: number,
): JumpTarget {
  return {
    chapterIndex,
    token,
    ranges: [
      {
        path: resolved.ref.filePath,
        side: resolved.ref.side,
        startLine: resolved.ref.startLine,
        endLine: resolved.ref.endLine,
      },
    ],
    anchor: {
      path: resolved.line.path,
      kind: resolved.line.kind,
      lineNumber: resolved.line.n,
    },
  };
}

/** Stable identity for a diff row linked from any 검토할 사항 lineRef. */
export type FocusLineMarker = {
  path: string;
  lineNumber: number;
  kind: ReviewDiffLine["kind"];
  keyChangeId: string;
};

/** Every resolvable focus-question line in a chapter — always-on markers for full ranges. */
export function collectFocusLineMarkers(chapter: ReviewChapter): FocusLineMarker[] {
  const markers: FocusLineMarker[] = [];
  const seen = new Set<string>();
  for (const keyChange of chapter.keyChanges) {
    for (const ref of keyChange.lineRefs) {
      for (const line of resolveAllLinesForRef(chapter, ref)) {
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

/** True when this diff row falls inside any active jump range. */
export function isJumpLine(
  target: JumpTarget | null | undefined,
  line: ReviewDiffLine,
  chapterIndex: number,
): boolean {
  if (!target || target.chapterIndex !== chapterIndex) {
    return false;
  }
  for (const range of target.ranges) {
    if (line.path !== range.path) {
      continue;
    }
    const num = lineNumberForSide(line, range.side);
    if (num === null) {
      continue;
    }
    if (num >= range.startLine && num <= range.endLine) {
      return true;
    }
  }
  return false;
}

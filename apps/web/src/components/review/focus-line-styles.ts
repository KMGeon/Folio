import type { ReviewDiffLine } from "@/lib/review-api";

import { cn } from "@/lib/utils";

import type { FocusLineMarker, JumpTarget } from "./resolve-line-ref";

export const EMPTY_FOCUS_MARKERS: FocusLineMarker[] = [];

/** Matches JumpTarget fields so key-change navigation can highlight the right row. */
export function isJumpLine(
  target: JumpTarget | null | undefined,
  line: ReviewDiffLine,
  chapterIndex: number,
): boolean {
  if (!target || target.chapterIndex !== chapterIndex) {
    return false;
  }
  return target.path === line.path && target.kind === line.kind && target.lineNumber === line.n;
}

/** Always-on focus markers + active jump — amber rail vs strong primary pulse. */
export function focusRowClass(isFocus: boolean, isJump: boolean, isActive: boolean): string {
  return cn(
    isActive && "bg-primary/15",
    isFocus && !isJump && "border-l-2 border-warning/70 bg-warning/10",
    isJump && "border-l-2 border-primary bg-primary/20 ring-1 ring-inset ring-primary/50",
  );
}

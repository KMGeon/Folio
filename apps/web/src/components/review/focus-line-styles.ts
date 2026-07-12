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

/**
 * Diff row styling for focus links.
 * Do NOT use primary green here — it collides with addition (diff-add) green.
 * - linked focus (always-on): amber warning rail
 * - active jump: info blue rail + ring so it stays distinct from add/del
 */
export function focusRowClass(isFocus: boolean, isJump: boolean, isActive: boolean): string {
  return cn(
    isActive && !isJump && !isFocus && "bg-info/10",
    isFocus && !isJump && "border-l-[3px] border-warning bg-warning/15",
    isJump && "border-l-[3px] border-info bg-info/20 ring-1 ring-inset ring-info/60",
  );
}

/** Gutter/dot for linked vs currently jumped focus lines. */
export function focusMarkerDotClass(isJump: boolean): string {
  return cn(
    "inline-flex size-2.5 shrink-0 rounded-full",
    isJump
      ? "bg-info shadow-[0_0_0_3px] shadow-info/35"
      : "bg-warning shadow-[0_0_0_2px] shadow-warning/25",
  );
}

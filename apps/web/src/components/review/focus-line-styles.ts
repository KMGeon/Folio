import { cn } from "@/lib/utils";

import type { FocusLineMarker } from "./resolve-line-ref";

export const EMPTY_FOCUS_MARKERS: FocusLineMarker[] = [];

// isJumpLine lives on resolve-line-ref so range matching stays with the data model.
export { isJumpLine } from "./resolve-line-ref";

/**
 * Diff row styling for focus links.
 * Do NOT use primary green here — it collides with addition (diff-add) green.
 * - linked focus (always-on): amber warning rail
 * - active jump (full range): info blue rail + ring so it stays distinct from add/del
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

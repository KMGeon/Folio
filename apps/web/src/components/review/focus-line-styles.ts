import { cn } from "@/lib/utils";

import type { FocusLineMarker } from "./resolve-line-ref";

export const EMPTY_FOCUS_MARKERS: FocusLineMarker[] = [];

// isJumpLine lives on resolve-line-ref so range matching stays with the data model.
export { isJumpLine } from "./resolve-line-ref";

/**
 * Diff row styling for focus links.
 * Do NOT use primary green (collides with diff-add) or left rails (reads as selection).
 * Active jump does not paint the row — the amber gutter circle alone is the pointer.
 */
export function focusRowClass(isFocus: boolean, isJump: boolean, isActive: boolean): string {
  return cn(
    // Comment selection only — keep quiet; never paint 검토할 사항 jumps as a block.
    isActive && !isJump && !isFocus && "bg-muted/40",
  );
}

/** Amber circle pointer for the active jump anchor row (no rail / no row fill). */
export function focusMarkerDotClass(isJump: boolean): string {
  return cn(
    "inline-flex size-2.5 shrink-0 rounded-full bg-warning",
    isJump ? "shadow-[0_0_0_3px] shadow-warning/40" : "shadow-[0_0_0_2px] shadow-warning/25",
  );
}

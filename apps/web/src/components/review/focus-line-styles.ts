import { cn } from "@/lib/utils";

import type { FocusLineMarker } from "./resolve-line-ref";

export const EMPTY_FOCUS_MARKERS: FocusLineMarker[] = [];

// isJumpLine lives on resolve-line-ref so range matching stays with the data model.
export { isJumpLine } from "./resolve-line-ref";

/**
 * Diff row styling for focus links.
 * Do NOT use primary green here — it collides with addition (diff-add) green.
 * - linked focus (always-on): thin amber left rail only (no fill) so multi-line
 *   ranges stay readable while reviewing
 * - active jump: single anchor row only — amber rail + light fill + ring to “point”
 */
export function focusRowClass(isFocus: boolean, isJump: boolean, isActive: boolean): string {
  return cn(
    // Comment selection only — keep quiet; never use blue for 검토할 사항 jumps.
    isActive && !isJump && !isFocus && "bg-muted/40",
    // Linked range: rail only — full-row amber wash makes long diffs unreadable.
    isFocus && !isJump && "border-l-[3px] border-warning/70",
    // Active jump is one row (anchor); keep fill light so code stays legible.
    isJump && "border-l-[3px] border-warning bg-warning/18 ring-1 ring-inset ring-warning/40",
  );
}

/** Gutter/dot for linked vs currently jumped focus lines. */
export function focusMarkerDotClass(isJump: boolean): string {
  return cn(
    "inline-flex size-2.5 shrink-0 rounded-full",
    isJump
      ? "bg-warning shadow-[0_0_0_3px] shadow-warning/40"
      : "bg-warning shadow-[0_0_0_2px] shadow-warning/25",
  );
}

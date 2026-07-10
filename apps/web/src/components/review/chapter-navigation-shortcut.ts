export type ChapterNavigationShortcut = "previous" | "next";

export function getChapterNavigationShortcut(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey" | "target">,
  target = event.target,
): ChapterNavigationShortcut | null {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    isEditableTarget(target)
  ) {
    return null;
  }

  if (event.key === "[") {
    return "previous";
  }

  return event.key === "]" ? "next" : null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    Boolean(target.closest("input, textarea, select, [contenteditable]"))
  );
}

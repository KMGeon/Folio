export const REVIEW_PREFERENCES_KEY = "folio:review-preferences:v1";

export interface ReviewPreferences {
  textSize: "compact" | "default";
  chapterPanel: "left" | "right";
  showReviewFocus: boolean;
  diffLayout: "unified" | "split";
}

export const DEFAULT_REVIEW_PREFERENCES: ReviewPreferences = {
  textSize: "compact",
  chapterPanel: "right",
  showReviewFocus: true,
  diffLayout: "split",
};

export function parseReviewPreferences(value: unknown): ReviewPreferences {
  if (!value || typeof value !== "object") {
    return DEFAULT_REVIEW_PREFERENCES;
  }
  const candidate = value as Partial<ReviewPreferences>;
  if (
    (candidate.textSize !== "compact" && candidate.textSize !== "default") ||
    (candidate.chapterPanel !== "left" && candidate.chapterPanel !== "right") ||
    typeof candidate.showReviewFocus !== "boolean" ||
    (candidate.diffLayout !== "unified" && candidate.diffLayout !== "split")
  ) {
    return DEFAULT_REVIEW_PREFERENCES;
  }
  return candidate as ReviewPreferences;
}

export function readReviewPreferences(): ReviewPreferences {
  try {
    const stored = globalThis.localStorage?.getItem(REVIEW_PREFERENCES_KEY);
    return stored ? parseReviewPreferences(JSON.parse(stored)) : DEFAULT_REVIEW_PREFERENCES;
  } catch {
    return DEFAULT_REVIEW_PREFERENCES;
  }
}

export function writeReviewPreferences(preferences: ReviewPreferences): void {
  try {
    globalThis.localStorage?.setItem(REVIEW_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Browser privacy settings can disable storage; in-memory UI state still works.
  }
}

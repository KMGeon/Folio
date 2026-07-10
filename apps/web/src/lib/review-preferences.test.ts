import { describe, expect, it } from "vitest";

import {
  DEFAULT_REVIEW_PREFERENCES,
  parseReviewPreferences,
  REVIEW_PREFERENCES_KEY,
} from "./review-preferences";

describe("review preferences", () => {
  it("parses supported values", () => {
    expect(
      parseReviewPreferences({
        textSize: "default",
        chapterPanel: "left",
        showReviewFocus: false,
        diffLayout: "unified",
      }),
    ).toEqual({
      textSize: "default",
      chapterPanel: "left",
      showReviewFocus: false,
      diffLayout: "unified",
    });
  });

  it("falls back when stored values are malformed", () => {
    expect(parseReviewPreferences({ textSize: "huge" })).toEqual(DEFAULT_REVIEW_PREFERENCES);
    expect(parseReviewPreferences(null)).toEqual(DEFAULT_REVIEW_PREFERENCES);
  });

  it("uses a versioned storage key", () => {
    expect(REVIEW_PREFERENCES_KEY).toBe("folio:review-preferences:v1");
  });
});

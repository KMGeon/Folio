// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { getChapterNavigationShortcut } from "./chapter-navigation-shortcut";

describe("getChapterNavigationShortcut", () => {
  it("maps bracket keys to chapter navigation", () => {
    expect(getChapterNavigationShortcut(new KeyboardEvent("keydown", { key: "[" }))).toBe(
      "previous",
    );
    expect(getChapterNavigationShortcut(new KeyboardEvent("keydown", { key: "]" }))).toBe("next");
  });

  it("ignores modified keys and editable targets", () => {
    expect(
      getChapterNavigationShortcut(new KeyboardEvent("keydown", { key: "]", metaKey: true })),
    ).toBeNull();

    const input = document.createElement("input");
    expect(
      getChapterNavigationShortcut(new KeyboardEvent("keydown", { key: "[" }), input),
    ).toBeNull();
  });

  it("ignores unrelated keys", () => {
    expect(
      getChapterNavigationShortcut(new KeyboardEvent("keydown", { key: "ArrowRight" })),
    ).toBeNull();
  });
});

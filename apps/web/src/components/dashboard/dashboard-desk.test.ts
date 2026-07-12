import { describe, expect, it } from "vitest";

import { isOpenQueueEmpty } from "./dashboard-desk";

describe("isOpenQueueEmpty", () => {
  it("is false while any open bucket is still loading", () => {
    expect(
      isOpenQueueEmpty({
        ready: { count: 0, isInitialLoading: true },
        yours: { count: 0, isInitialLoading: false },
        other: { count: 0, isInitialLoading: false },
      }),
    ).toBe(false);
  });

  it("is true only when every open bucket has loaded empty", () => {
    expect(
      isOpenQueueEmpty({
        ready: { count: 0, isInitialLoading: false },
        yours: { count: 0, isInitialLoading: false },
        other: { count: 0, isInitialLoading: false },
      }),
    ).toBe(true);
    expect(
      isOpenQueueEmpty({
        ready: { count: 1, isInitialLoading: false },
        yours: { count: 0, isInitialLoading: false },
        other: { count: 0, isInitialLoading: false },
      }),
    ).toBe(false);
  });
});

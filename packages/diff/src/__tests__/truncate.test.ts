import { describe, expect, it } from "vitest";
import { MAX_DIFF_CHARS, truncateForLlm } from "../truncate.js";

describe("truncateForLlm", () => {
  it("exposes a positive MAX_DIFF_CHARS default", () => {
    expect(MAX_DIFF_CHARS).toBeGreaterThan(0);
  });

  it("passes through text under the limit", () => {
    expect(truncateForLlm("hello", 10)).toEqual({
      text: "hello",
      truncated: false,
      droppedChars: 0,
    });
  });

  it("passes through text exactly at the limit (boundary)", () => {
    const t = "abcde";
    expect(truncateForLlm(t, 5)).toEqual({ text: "abcde", truncated: false, droppedChars: 0 });
  });

  it("truncates text over the limit and reports dropped chars", () => {
    const res = truncateForLlm("abcdefghij", 4);
    expect(res.text).toBe("abcd");
    expect(res.truncated).toBe(true);
    expect(res.droppedChars).toBe(6);
  });

  it("defaults to MAX_DIFF_CHARS", () => {
    const big = "x".repeat(MAX_DIFF_CHARS + 5);
    const res = truncateForLlm(big);
    expect(res.truncated).toBe(true);
    expect(res.text).toHaveLength(MAX_DIFF_CHARS);
    expect(res.droppedChars).toBe(5);
  });
});

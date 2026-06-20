import { describe, expect, it } from "vitest";
import { parseRepoFullName } from "../ref.js";

describe("parseRepoFullName", () => {
  it("splits owner/repo", () => {
    expect(parseRepoFullName("acme/widgets")).toEqual({ owner: "acme", repo: "widgets" });
  });

  it("trims surrounding whitespace", () => {
    expect(parseRepoFullName("  acme/widgets  ")).toEqual({ owner: "acme", repo: "widgets" });
  });

  it("rejects missing slash", () => {
    expect(() => parseRepoFullName("acme")).toThrow(/owner\/repo/);
  });

  it("rejects empty segments", () => {
    expect(() => parseRepoFullName("/widgets")).toThrow();
    expect(() => parseRepoFullName("acme/")).toThrow();
  });

  it("rejects extra slashes", () => {
    expect(() => parseRepoFullName("acme/widgets/extra")).toThrow();
  });
});

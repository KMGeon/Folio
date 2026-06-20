import { describe, expect, it } from "vitest";
import { ChaptersResponseSchema } from "./api.js";

const pr = {
  id: "pr1",
  repoId: "repo1",
  githubPrNumber: 42,
  title: "Add feature",
  body: null,
  authorLogin: "octocat",
  baseRef: "main",
  headRef: "feature",
  headSha: "a".repeat(40),
  status: "open",
  htmlUrl: "https://github.com/x/y/pull/42",
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
};

const revision = {
  id: "rev1",
  prId: "pr1",
  index: 0,
  headSha: "a".repeat(40),
  baseSha: "b".repeat(40),
  mergeBaseSha: "c".repeat(40),
  createdAt: "2026-06-20T12:00:00.000Z",
};

describe("ChaptersResponseSchema (wire, non-strict)", () => {
  it("parses with null prologue and empty chapters", () => {
    const res = ChaptersResponseSchema.parse({ pr, revision, prologue: null, chapters: [] });
    expect(res.chapters).toEqual([]);
  });

  it("ignores unknown top-level keys (non-strict)", () => {
    const res = ChaptersResponseSchema.safeParse({
      pr,
      revision,
      prologue: null,
      chapters: [],
      extra: "ignored",
    });
    expect(res.success).toBe(true);
  });

  it("rejects an invalid pr status", () => {
    expect(
      ChaptersResponseSchema.safeParse({
        pr: { ...pr, status: "weird" },
        revision,
        prologue: null,
        chapters: [],
      }).success,
    ).toBe(false);
  });
});

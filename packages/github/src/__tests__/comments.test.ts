import type { Octokit } from "octokit";
import { describe, expect, it, vi } from "vitest";
import { commentMarker, findMarkedComment, upsertMarkedComment, withMarker } from "../comments.js";

const REF = { owner: "acme", repo: "widgets", number: 5 };
const KEY = "review-summary";

describe("comment marker logic", () => {
  it("embeds an HTML-comment marker", () => {
    expect(commentMarker(KEY)).toBe("<!-- folio:review-summary -->");
    expect(withMarker("hello", KEY)).toContain("<!-- folio:review-summary -->");
  });

  it("finds the comment bearing the marker", () => {
    const comments = [
      { id: 1, body: "unrelated", user: "alice", createdAt: "t1", htmlUrl: "u1" },
      {
        id: 2,
        body: withMarker("our table", KEY),
        user: "folio[bot]",
        createdAt: "t2",
        htmlUrl: "u2",
      },
    ];
    expect(findMarkedComment(comments, KEY)?.id).toBe(2);
    expect(findMarkedComment(comments, "other")).toBeNull();
  });
});

describe("upsertMarkedComment (edit-in-place)", () => {
  it("updates the existing marked comment instead of creating a new one", async () => {
    const updateComment = vi.fn().mockResolvedValue({});
    const createComment = vi.fn();
    const paginate = vi
      .fn()
      .mockResolvedValue([{ id: 77, body: withMarker("old", KEY), user: { login: "folio[bot]" } }]);
    const client = {
      rest: {
        issues: {
          listComments: "listComments-endpoint",
          updateComment,
          createComment,
        },
      },
      paginate,
    } as unknown as Octokit;

    const result = await upsertMarkedComment(client, REF, KEY, "new body");
    expect(result).toEqual({ id: 77, created: false });
    expect(createComment).not.toHaveBeenCalled();
    expect(updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 77, body: withMarker("new body", KEY) }),
    );
  });

  it("creates a fresh marked comment when none exists", async () => {
    const updateComment = vi.fn();
    const createComment = vi.fn().mockResolvedValue({ data: { id: 88 } });
    const paginate = vi
      .fn()
      .mockResolvedValue([{ id: 1, body: "someone else", user: { login: "alice" } }]);
    const client = {
      rest: {
        issues: {
          listComments: "listComments-endpoint",
          updateComment,
          createComment,
        },
      },
      paginate,
    } as unknown as Octokit;

    const result = await upsertMarkedComment(client, REF, KEY, "first body");
    expect(result).toEqual({ id: 88, created: true });
    expect(updateComment).not.toHaveBeenCalled();
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: withMarker("first body", KEY) }),
    );
  });
});

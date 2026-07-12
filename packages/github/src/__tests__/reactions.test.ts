import { describe, expect, it, vi } from "vitest";
import { createIssueReaction } from "../reactions.js";

describe("createIssueReaction", () => {
  it("posts a reaction on the PR/issue body", async () => {
    const createForIssue = vi.fn().mockResolvedValue({ data: { id: 99 } });
    const client = {
      rest: { reactions: { createForIssue } },
    };

    const result = await createIssueReaction(
      client as never,
      { owner: "acme", repo: "widget", number: 7 },
      "eyes",
    );

    expect(result).toEqual({ id: 99 });
    expect(createForIssue).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widget",
      issue_number: 7,
      content: "eyes",
    });
  });

  it("wraps API failures", async () => {
    const client = {
      rest: {
        reactions: {
          createForIssue: vi.fn().mockRejectedValue(new Error("403 missing permission")),
        },
      },
    };

    await expect(
      createIssueReaction(client as never, { owner: "acme", repo: "widget", number: 1 }, "eyes"),
    ).rejects.toThrow(/Failed to create issue reaction \(eyes\): 403 missing permission/);
  });
});

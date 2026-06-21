import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { ReviewCommentFacade } from "../../../application/review/review-comment.facade.js";
import { ReviewPullFacade } from "../../../application/review/review-pull.facade.js";
import { ReviewReadFacade } from "../../../application/review/review-read.facade.js";
import { ReviewStateFacade } from "../../../application/review/review-state.facade.js";
import { RepoAccessGuard } from "../common/repo-access.guard.js";
import { type AuthedUser, SessionAuthGuard } from "../common/session-auth.guard.js";
import { PullsController } from "./pulls.controller.js";

// This unit test calls controller methods directly; bypass the auth guards
// (their DI lives in AuthModule) so the test stays focused on controller logic.
const allowGuard = { canActivate: () => true };
const user: AuthedUser = { id: "u1", login: "octocat", avatarUrl: "https://a/u1" };

async function buildController(overrides: {
  run?: ReturnType<typeof vi.fn>;
  getReview?: ReturnType<typeof vi.fn>;
  setChapterViewed?: ReturnType<typeof vi.fn>;
  createInlineComment?: ReturnType<typeof vi.fn>;
}) {
  const moduleRef = await Test.createTestingModule({
    controllers: [PullsController],
    providers: [
      { provide: ReviewPullFacade, useValue: { run: overrides.run ?? vi.fn() } },
      { provide: ReviewReadFacade, useValue: { getReview: overrides.getReview ?? vi.fn() } },
      {
        provide: ReviewStateFacade,
        useValue: { setChapterViewed: overrides.setChapterViewed ?? vi.fn() },
      },
      {
        provide: ReviewCommentFacade,
        useValue: { createInlineComment: overrides.createInlineComment ?? vi.fn() },
      },
    ],
  })
    .overrideGuard(SessionAuthGuard)
    .useValue(allowGuard)
    .overrideGuard(RepoAccessGuard)
    .useValue(allowGuard)
    .compile();
  return moduleRef.get(PullsController);
}

describe("PullsController", () => {
  it("POST triggers a review run", async () => {
    const run = vi.fn(async () => ({
      prId: "pr1",
      revisionId: "rev1",
      chapters: [{ order: 1, title: "C1" }],
      commentUrl: "u",
      commentError: null,
    }));
    const controller = await buildController({ run });

    const result = await controller.createReview({ owner: "acme", repo: "widget", number: 7 });
    expect(run).toHaveBeenCalledWith({ owner: "acme", repo: "widget", number: 7 });
    expect(result.chapters).toHaveLength(1);
  });

  it("GET returns the review payload scoped to the current user", async () => {
    const getReview = vi.fn(async () => ({ pr: { title: "PR" }, chapters: [] }));
    const controller = await buildController({ getReview });

    const result = await controller.getReview("acme", "widget", "7", user);
    expect(getReview).toHaveBeenCalledWith("acme", "widget", 7, "u1");
    expect(result.pr.title).toBe("PR");
  });

  it("PATCH toggles a chapter's viewed mark and returns progress", async () => {
    const setChapterViewed = vi.fn(async () => ({
      index: 2,
      viewed: true,
      progress: { viewed: 1, total: 3 },
    }));
    const controller = await buildController({ setChapterViewed });

    const result = await controller.setChapterViewed(
      "acme",
      "widget",
      "7",
      "2",
      { viewed: true },
      user,
    );
    expect(setChapterViewed).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widget",
      number: 7,
      index: 2,
      viewed: true,
      userId: "u1",
    });
    expect(result.progress).toEqual({ viewed: 1, total: 3 });
  });

  it("POST creates an inline review comment with the current user's login", async () => {
    const createInlineComment = vi.fn(async () => ({
      id: "comment1",
      githubCommentId: 123,
      htmlUrl: "https://github.com/acme/widget/pull/7#discussion_r123",
    }));
    const controller = await buildController({ createInlineComment });

    const result = await controller.createInlineComment(
      "acme",
      "widget",
      "7",
      {
        chapterIndex: 1,
        path: "src/a.ts",
        side: "RIGHT",
        line: 12,
        body: "  확인이 필요합니다.  ",
      },
      user,
    );

    expect(createInlineComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widget",
      number: 7,
      chapterIndex: 1,
      path: "src/a.ts",
      side: "RIGHT",
      line: 12,
      body: "확인이 필요합니다.",
      authorLogin: "octocat",
    });
    expect(result.githubCommentId).toBe(123);
  });
});

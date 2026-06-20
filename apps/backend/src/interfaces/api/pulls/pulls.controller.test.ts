import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { ReviewPullFacade } from "../../../application/review/review-pull.facade.js";
import { ReviewReadFacade } from "../../../application/review/review-read.facade.js";
import { RepoAccessGuard } from "../common/repo-access.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { PullsController } from "./pulls.controller.js";

// This unit test calls controller methods directly; bypass the auth guards
// (their DI lives in AuthModule) so the test stays focused on controller logic.
const allowGuard = { canActivate: () => true };

describe("PullsController", () => {
  it("POST triggers a review run", async () => {
    const run = vi.fn(async () => ({
      prId: "pr1",
      revisionId: "rev1",
      chapters: [{ order: 1, title: "C1" }],
      commentUrl: "u",
      commentError: null,
    }));
    const moduleRef = await Test.createTestingModule({
      controllers: [PullsController],
      providers: [
        { provide: ReviewPullFacade, useValue: { run } },
        { provide: ReviewReadFacade, useValue: { getReview: vi.fn() } },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue(allowGuard)
      .overrideGuard(RepoAccessGuard)
      .useValue(allowGuard)
      .compile();
    const controller = moduleRef.get(PullsController);

    const result = await controller.createReview({ owner: "acme", repo: "widget", number: 7 });
    expect(run).toHaveBeenCalledWith({ owner: "acme", repo: "widget", number: 7 });
    expect(result.chapters).toHaveLength(1);
  });

  it("GET returns the review payload", async () => {
    const getReview = vi.fn(async () => ({ pr: { title: "PR" }, chapters: [] }));
    const moduleRef = await Test.createTestingModule({
      controllers: [PullsController],
      providers: [
        { provide: ReviewPullFacade, useValue: { run: vi.fn() } },
        { provide: ReviewReadFacade, useValue: { getReview } },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue(allowGuard)
      .overrideGuard(RepoAccessGuard)
      .useValue(allowGuard)
      .compile();
    const controller = moduleRef.get(PullsController);

    const result = await controller.getReview("acme", "widget", "7");
    expect(getReview).toHaveBeenCalledWith("acme", "widget", 7);
    expect(result.pr.title).toBe("PR");
  });
});

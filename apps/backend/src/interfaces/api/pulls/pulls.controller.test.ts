import { ENTITLEMENT_FEATURE, WORKSPACE_ROLE } from "@folio/types";
import { GUARDS_METADATA } from "@nestjs/common/constants.js";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { ReviewCommentFacade } from "../../../application/review/review-comment.facade.js";
import { ReviewRequestFacade } from "../../../application/review/review-request.facade.js";
import { ReviewReadFacade } from "../../../application/review/review-read.facade.js";
import { ReviewStateFacade } from "../../../application/review/review-state.facade.js";
import { RepoAccessGuard } from "../common/repo-access.guard.js";
import { type AuthedUser, SessionAuthGuard } from "../common/session-auth.guard.js";
import { EntitlementGuard } from "../authorization/entitlement.guard.js";
import { RepositoryPermissionGuard } from "../authorization/repository-permission.guard.js";
import { REQUIRE_LIVE_REPOSITORY_PERMISSION } from "../authorization/require-live-repository-permission.decorator.js";
import { REQUIRE_REPOSITORY_PERMISSION } from "../authorization/require-repository-permission.decorator.js";
import { REQUIRE_ENTITLEMENT } from "../authorization/require-entitlement.decorator.js";
import { REQUIRE_WORKSPACE_ROLE } from "../authorization/require-workspace-role.decorator.js";
import { WorkspaceRoleGuard } from "../authorization/workspace-role.guard.js";
import { PullsController } from "./pulls.controller.js";

// This unit test calls controller methods directly; bypass the auth guards
// (their DI lives in AuthModule) so the test stays focused on controller logic.
const allowGuard = { canActivate: () => true };
const user: AuthedUser = { id: "u1", login: "octocat", avatarUrl: "https://a/u1" };

async function buildController(overrides: {
  enqueue?: ReturnType<typeof vi.fn>;
  getReview?: ReturnType<typeof vi.fn>;
  setChapterViewed?: ReturnType<typeof vi.fn>;
  setFileViewed?: ReturnType<typeof vi.fn>;
  setKeyChangeViewed?: ReturnType<typeof vi.fn>;
  createInlineComment?: ReturnType<typeof vi.fn>;
}) {
  const moduleRef = await Test.createTestingModule({
    controllers: [PullsController],
    providers: [
      { provide: ReviewRequestFacade, useValue: { enqueue: overrides.enqueue ?? vi.fn() } },
      { provide: ReviewReadFacade, useValue: { getReview: overrides.getReview ?? vi.fn() } },
      {
        provide: ReviewStateFacade,
        useValue: {
          setChapterViewed: overrides.setChapterViewed ?? vi.fn(),
          setFileViewed: overrides.setFileViewed ?? vi.fn(),
          setKeyChangeViewed: overrides.setKeyChangeViewed ?? vi.fn(),
        },
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
    .overrideGuard(RepositoryPermissionGuard)
    .useValue(allowGuard)
    .overrideGuard(WorkspaceRoleGuard)
    .useValue(allowGuard)
    .overrideGuard(EntitlementGuard)
    .useValue(allowGuard)
    .compile();
  return moduleRef.get(PullsController);
}

describe("PullsController", () => {
  it.each([
    ["createReview", "write", ENTITLEMENT_FEATURE.PR_ANALYSIS],
    ["getReview", "read", ENTITLEMENT_FEATURE.REVIEW_READ],
    ["setChapterViewed", "read", ENTITLEMENT_FEATURE.REVIEW_STATE_MUTATION],
    ["setFileViewed", "read", ENTITLEMENT_FEATURE.REVIEW_STATE_MUTATION],
    ["setKeyChangeViewed", "read", ENTITLEMENT_FEATURE.REVIEW_STATE_MUTATION],
    ["createInlineComment", "write", ENTITLEMENT_FEATURE.COMMENT],
  ])("enforces all three authorization axes for %s", (methodName, level, entitlement) => {
    const handler = Object.getOwnPropertyDescriptor(PullsController.prototype, methodName)?.value;

    expect(Reflect.getMetadata(REQUIRE_REPOSITORY_PERMISSION, handler)).toBe(level);
    expect(Reflect.getMetadata(REQUIRE_WORKSPACE_ROLE, handler)).toBe(WORKSPACE_ROLE.REVIEWER);
    expect(Reflect.getMetadata(REQUIRE_ENTITLEMENT, handler)).toBe(entitlement);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      RepositoryPermissionGuard,
      WorkspaceRoleGuard,
      EntitlementGuard,
    ]);
  });

  it.each([
    "createReview",
    "setChapterViewed",
    "setFileViewed",
    "setKeyChangeViewed",
    "createInlineComment",
  ])("requires live repository permission for the %s mutation", (methodName) => {
    const handler = Object.getOwnPropertyDescriptor(PullsController.prototype, methodName)?.value;

    expect(Reflect.getMetadata(REQUIRE_LIVE_REPOSITORY_PERMISSION, handler)).toBe(true);
  });

  it("keeps the review GET cache-eligible", () => {
    const handler = Object.getOwnPropertyDescriptor(PullsController.prototype, "getReview")?.value;

    expect(Reflect.getMetadata(REQUIRE_LIVE_REPOSITORY_PERMISSION, handler)).toBeUndefined();
  });

  it("POST enqueues an asynchronous review", async () => {
    const enqueue = vi.fn(async () => ({ jobId: "job-1", status: "pending" }));
    const controller = await buildController({ enqueue });

    const result = await controller.createReview({ owner: "acme", repo: "widget", number: 7 });
    expect(enqueue).toHaveBeenCalledWith({ owner: "acme", repo: "widget", number: 7 });
    expect(result.jobId).toBe("job-1");
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

  it("PATCH toggles a file's viewed mark and returns file progress", async () => {
    const setFileViewed = vi.fn(async () => ({
      path: "src/a.ts",
      viewed: true,
      progress: { viewed: 1, total: 2 },
    }));
    const controller = await buildController({ setFileViewed });

    const result = await controller.setFileViewed(
      "acme",
      "widget",
      "7",
      { path: " src/a.ts ", viewed: true },
      user,
    );

    expect(setFileViewed).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widget",
      number: 7,
      path: "src/a.ts",
      viewed: true,
      userId: "u1",
    });
    expect(result.progress).toEqual({ viewed: 1, total: 2 });
  });

  it("PATCH toggles a key-change viewed mark", async () => {
    const setKeyChangeViewed = vi.fn(async () => ({
      id: "chapter-1-kc-1",
      viewed: true,
    }));
    const controller = await buildController({ setKeyChangeViewed });

    const result = await controller.setKeyChangeViewed(
      "acme",
      "widget",
      "7",
      "1",
      "chapter-1-kc-1",
      { viewed: true },
      user,
    );

    expect(setKeyChangeViewed).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widget",
      number: 7,
      index: 1,
      keyChangeId: "chapter-1-kc-1",
      viewed: true,
      userId: "u1",
    });
    expect(result).toEqual({ id: "chapter-1-kc-1", viewed: true });
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

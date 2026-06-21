import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ReviewCommentFacade } from "../../../application/review/review-comment.facade.js";
import { ReviewPullFacade } from "../../../application/review/review-pull.facade.js";
import { ReviewReadFacade } from "../../../application/review/review-read.facade.js";
import { ReviewStateFacade } from "../../../application/review/review-state.facade.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { RepoAccessGuard } from "../common/repo-access.guard.js";
import { type AuthedUser, SessionAuthGuard } from "../common/session-auth.guard.js";

interface CreateReviewBody {
  owner: string;
  repo: string;
  number: number;
}

interface SetViewedBody {
  viewed: boolean;
}

interface CreateInlineCommentBody {
  chapterIndex: number;
  path: string;
  side: "LEFT" | "RIGHT";
  line: number;
  body: string;
}

@Controller("api/v1/pulls")
@UseGuards(SessionAuthGuard)
export class PullsController {
  constructor(
    // Explicit @Inject tokens because vitest doesn't emit decorator metadata.
    @Inject(ReviewPullFacade) private readonly reviewPull: ReviewPullFacade,
    @Inject(ReviewReadFacade) private readonly reviewRead: ReviewReadFacade,
    @Inject(ReviewStateFacade) private readonly reviewState: ReviewStateFacade,
    @Inject(ReviewCommentFacade) private readonly reviewComment: ReviewCommentFacade,
  ) {}

  /** Manually trigger decomposition for a PR (read diff → decompose → persist → comment). */
  // Session-only: owner/repo arrive in the body, so the route-param RepoAccessGuard
  // can't gate this; body-scoped repo authorization is a follow-up.
  @Post()
  async createReview(@Body() body: CreateReviewBody) {
    return this.reviewPull.run({ owner: body.owner, repo: body.repo, number: body.number });
  }

  @Get(":owner/:repo/:number/review")
  @UseGuards(RepoAccessGuard)
  async getReview(
    @Param("owner") owner: string,
    @Param("repo") repo: string,
    @Param("number", ParseIntPipe) number: string | number,
    @CurrentUser() user: AuthedUser,
  ) {
    // ParseIntPipe only runs in the HTTP pipeline; coerce here for unit-test compatibility.
    const payload = await this.reviewRead.getReview(owner, repo, Number(number), user.id);
    if (!payload) {
      throw new NotFoundException(`No review found for ${owner}/${repo}#${number}`);
    }
    return payload;
  }

  /** Toggle a chapter's viewed mark for the current user; returns updated progress. */
  @Patch(":owner/:repo/:number/chapters/:index/viewed")
  @UseGuards(RepoAccessGuard)
  async setChapterViewed(
    @Param("owner") owner: string,
    @Param("repo") repo: string,
    @Param("number", ParseIntPipe) number: string | number,
    @Param("index", ParseIntPipe) index: string | number,
    @Body() body: SetViewedBody,
    @CurrentUser() user: AuthedUser,
  ) {
    const result = await this.reviewState.setChapterViewed({
      owner,
      repo,
      number: Number(number),
      index: Number(index),
      viewed: body.viewed,
      userId: user.id,
    });
    if (!result) {
      throw new NotFoundException(`No chapter ${index} for ${owner}/${repo}#${number}`);
    }
    return result;
  }

  /** Create a GitHub inline review comment for a diff line. */
  @Post(":owner/:repo/:number/comments")
  @UseGuards(RepoAccessGuard)
  async createInlineComment(
    @Param("owner") owner: string,
    @Param("repo") repo: string,
    @Param("number", ParseIntPipe) number: string | number,
    @Body() body: CreateInlineCommentBody,
    @CurrentUser() user: AuthedUser,
  ) {
    const commentBody = body.body?.trim();
    if (!commentBody) {
      throw new BadRequestException("Comment body is required");
    }
    if (body.side !== "LEFT" && body.side !== "RIGHT") {
      throw new BadRequestException("Comment side must be LEFT or RIGHT");
    }
    if (!body.path?.trim()) {
      throw new BadRequestException("Comment path is required");
    }
    if (!Number.isInteger(Number(body.line)) || Number(body.line) < 1) {
      throw new BadRequestException("Comment line must be a positive integer");
    }
    if (!Number.isInteger(Number(body.chapterIndex)) || Number(body.chapterIndex) < 1) {
      throw new BadRequestException("Comment chapterIndex must be a positive integer");
    }
    const result = await this.reviewComment.createInlineComment({
      owner,
      repo,
      number: Number(number),
      chapterIndex: Number(body.chapterIndex),
      path: body.path.trim(),
      side: body.side,
      line: Number(body.line),
      body: commentBody,
      authorLogin: user.login,
    });
    if (!result) {
      throw new NotFoundException(`No review target found for ${owner}/${repo}#${number}`);
    }
    return result;
  }
}

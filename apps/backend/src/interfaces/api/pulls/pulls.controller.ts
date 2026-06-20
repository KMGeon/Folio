import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
} from "@nestjs/common";
import { ReviewPullFacade } from "../../../application/review/review-pull.facade.js";
import { ReviewReadFacade } from "../../../application/review/review-read.facade.js";

interface CreateReviewBody {
  owner: string;
  repo: string;
  number: number;
}

@Controller("api/v1/pulls")
export class PullsController {
  constructor(
    // Explicit @Inject tokens because vitest doesn't emit decorator metadata.
    @Inject(ReviewPullFacade) private readonly reviewPull: ReviewPullFacade,
    @Inject(ReviewReadFacade) private readonly reviewRead: ReviewReadFacade,
  ) {}

  /** Manually trigger decomposition for a PR (read diff → decompose → persist → comment). */
  @Post()
  async createReview(@Body() body: CreateReviewBody) {
    return this.reviewPull.run({ owner: body.owner, repo: body.repo, number: body.number });
  }

  @Get(":owner/:repo/:number/review")
  async getReview(
    @Param("owner") owner: string,
    @Param("repo") repo: string,
    @Param("number", ParseIntPipe) number: string | number,
  ) {
    // ParseIntPipe only runs in the HTTP pipeline; coerce here for unit-test compatibility.
    const payload = await this.reviewRead.getReview(owner, repo, Number(number));
    if (!payload) {
      throw new NotFoundException(`No review found for ${owner}/${repo}#${number}`);
    }
    return payload;
  }
}

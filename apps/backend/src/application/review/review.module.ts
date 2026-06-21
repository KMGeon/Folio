import { Module } from "@nestjs/common";
import { PullsController } from "../../interfaces/api/pulls/pulls.controller.js";
import { AuthModule } from "../auth/auth.module.js";
import { ReviewPullFacade } from "./review-pull.facade.js";
import { ReviewCommentFacade } from "./review-comment.facade.js";
import { ReviewReadFacade } from "./review-read.facade.js";
import { ReviewStateFacade } from "./review-state.facade.js";

@Module({
  // AuthModule supplies the SessionAuthGuard/RepoAccessGuard used on PullsController.
  imports: [AuthModule],
  controllers: [PullsController],
  providers: [ReviewPullFacade, ReviewReadFacade, ReviewStateFacade, ReviewCommentFacade],
})
export class ReviewModule {}

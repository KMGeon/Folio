import { Module } from "@nestjs/common";
import { PullsController } from "../../interfaces/api/pulls/pulls.controller.js";
import { ReviewPullFacade } from "./review-pull.facade.js";
import { ReviewReadFacade } from "./review-read.facade.js";

@Module({
  controllers: [PullsController],
  providers: [ReviewPullFacade, ReviewReadFacade],
})
export class ReviewModule {}

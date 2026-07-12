import { Module } from "@nestjs/common";
import { RepoAccessService } from "../../domain/auth/repo-access.service.js";
import { DashboardController } from "../../interfaces/api/dashboard/dashboard.controller.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { BoardEventHub } from "./board-event-hub.js";
import { DashboardFacade } from "./dashboard.facade.js";
import { PullRequestIndexBackfill } from "./pull-request-index-backfill.js";
import { PullRequestIndexWriter } from "./pull-request-index-writer.js";

@Module({
  // AuthModule supplies the SessionAuthGuard used on DashboardController.
  imports: [AuthModule, AuthorizationModule],
  controllers: [DashboardController],
  providers: [
    BoardEventHub,
    PullRequestIndexWriter,
    PullRequestIndexBackfill,
    {
      provide: DashboardFacade,
      inject: [RepoAccessService],
      useFactory: (repoAccess: RepoAccessService) => new DashboardFacade({ repoAccess }),
    },
  ],
  exports: [BoardEventHub, PullRequestIndexWriter, PullRequestIndexBackfill],
})
export class DashboardModule {}

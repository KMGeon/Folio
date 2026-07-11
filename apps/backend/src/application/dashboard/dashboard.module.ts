import { Module } from "@nestjs/common";
import { RepoAccessService } from "../../domain/auth/repo-access.service.js";
import { DashboardController } from "../../interfaces/api/dashboard/dashboard.controller.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { DashboardFacade } from "./dashboard.facade.js";

@Module({
  // AuthModule supplies the SessionAuthGuard used on DashboardController.
  imports: [AuthModule, AuthorizationModule],
  controllers: [DashboardController],
  providers: [
    {
      provide: DashboardFacade,
      inject: [RepoAccessService],
      useFactory: (repoAccess: RepoAccessService) => new DashboardFacade({ repoAccess }),
    },
  ],
})
export class DashboardModule {}

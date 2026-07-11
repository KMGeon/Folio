import { Module } from "@nestjs/common";
import { DashboardController } from "../../interfaces/api/dashboard/dashboard.controller.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { DashboardFacade } from "./dashboard.facade.js";

@Module({
  // AuthModule supplies the SessionAuthGuard used on DashboardController.
  imports: [AuthModule, AuthorizationModule],
  controllers: [DashboardController],
  providers: [DashboardFacade],
})
export class DashboardModule {}

import { Module, forwardRef } from "@nestjs/common";
import { RepositoriesController } from "../../interfaces/api/repositories/repositories.controller.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { DashboardModule } from "../dashboard/dashboard.module.js";
import { RepositoriesFacade } from "./repositories.facade.js";

@Module({
  imports: [AuthModule, AuthorizationModule, forwardRef(() => DashboardModule)],
  controllers: [RepositoriesController],
  providers: [RepositoriesFacade],
  exports: [RepositoriesFacade],
})
export class RepositoriesModule {}

import { Module } from "@nestjs/common";
import { RepositoriesController } from "../../interfaces/api/repositories/repositories.controller.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { RepositoriesFacade } from "./repositories.facade.js";

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [RepositoriesController],
  providers: [RepositoriesFacade],
  exports: [RepositoriesFacade],
})
export class RepositoriesModule {}

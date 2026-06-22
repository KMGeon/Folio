import { Body, Controller, Get, Inject, Param, Patch, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { RepositoriesFacade } from "../../../application/repositories/repositories.facade.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { type AuthedUser, SessionAuthGuard } from "../common/session-auth.guard.js";

const ToggleRepositoryBodySchema = z.object({
  enabled: z.boolean(),
});

@Controller("api/v1/repositories")
@UseGuards(SessionAuthGuard)
export class RepositoriesController {
  constructor(
    @Inject(RepositoriesFacade) private readonly repositoriesFacade: RepositoriesFacade,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthedUser) {
    return this.repositoriesFacade.listForUser({ login: user.login });
  }

  @Patch(":id/enabled")
  async setEnabled(
    @CurrentUser() user: AuthedUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = ToggleRepositoryBodySchema.parse(body);
    return this.repositoriesFacade.setEnabled({
      user: { login: user.login },
      repositoryId: id,
      enabled: parsed.enabled,
    });
  }
}

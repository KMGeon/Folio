import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ENTITLEMENT_FEATURE, RepositoryPrioritySchema } from "@folio/types";
import { z } from "zod";
import { RepositoryPreferencesFacade } from "../../../application/repositories/repository-preferences.facade.js";
import { RepositoriesFacade } from "../../../application/repositories/repositories.facade.js";
import { EntitlementGuard } from "../authorization/entitlement.guard.js";
import { RequireEntitlement } from "../authorization/require-entitlement.decorator.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import {
  type AuthedRequest,
  type AuthedUser,
  SessionAuthGuard,
} from "../common/session-auth.guard.js";

const ToggleRepositoryBodySchema = z.object({
  enabled: z.boolean(),
});
const UpdateRepositorySettingsBodySchema = z
  .object({
    aiReplyEnabled: z.boolean().optional(),
    priority: RepositoryPrioritySchema.optional(),
  })
  .strict()
  .refine((body) => body.aiReplyEnabled !== undefined || body.priority !== undefined);

@Controller("api/v1/repositories")
@UseGuards(SessionAuthGuard)
export class RepositoriesController {
  constructor(
    @Inject(RepositoriesFacade) private readonly repositoriesFacade: RepositoriesFacade,
    @Inject(RepositoryPreferencesFacade)
    private readonly repositoryPreferences: RepositoryPreferencesFacade,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthedUser, @Req() request: Pick<AuthedRequest, "cookies">) {
    return this.repositoriesFacade.listForUser(
      { userId: user.id, login: user.login },
      selectedWorkspaceId(request),
    );
  }

  @Patch(":id/enabled")
  @UseGuards(EntitlementGuard)
  @RequireEntitlement(ENTITLEMENT_FEATURE.REPO_ACTIVATION)
  async setEnabled(
    @CurrentUser() user: AuthedUser,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Pick<AuthedRequest, "cookies">,
  ) {
    const parsed = ToggleRepositoryBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Repository enabled must be a boolean");
    }
    return this.repositoriesFacade.setEnabled(
      {
        user: { id: user.id, login: user.login },
        repositoryId: id,
        enabled: parsed.data.enabled,
      },
      selectedWorkspaceId(request),
    );
  }

  @Patch(":id/settings")
  @UseGuards(EntitlementGuard)
  @RequireEntitlement(ENTITLEMENT_FEATURE.REPO_ACTIVATION)
  async setPreferences(
    @CurrentUser() user: AuthedUser,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Pick<AuthedRequest, "cookies">,
  ) {
    const parsed = UpdateRepositorySettingsBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Repository settings must include a valid value");
    }
    return this.repositoryPreferences.setPreferences(
      {
        user: { id: user.id, login: user.login },
        repositoryId: id,
        ...parsed.data,
      },
      selectedWorkspaceId(request),
    );
  }
}

function selectedWorkspaceId(request: Pick<AuthedRequest, "cookies">): string | undefined {
  const value = request.cookies?.folio_workspace;
  return typeof value === "string" ? value : undefined;
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { WorkspaceClaimFacade } from "../../../application/authorization/workspace-claim.facade.js";
import { config } from "../../../config.js";
import { verifyInstallationClaimToken } from "../../../domain/auth/installation-claim-token.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import {
  type AuthedRequest,
  SessionAuthGuard,
  type AuthedUser,
} from "../common/session-auth.guard.js";

const INSTALLATION_CLAIM_COOKIE = "folio_installation_claim";
const ClaimBodySchema = z.object({ installationId: z.number().int().positive() }).strict();

@Controller("api/v1/workspaces")
@UseGuards(SessionAuthGuard)
export class WorkspaceController {
  constructor(@Inject(WorkspaceClaimFacade) private readonly claimFacade: WorkspaceClaimFacade) {}

  @Get("current")
  current(@CurrentUser() user: AuthedUser) {
    return this.claimFacade.currentContext(user.id);
  }

  @Post("claim")
  async claim(
    @CurrentUser() user: AuthedUser,
    @Body() body: unknown,
    @Req() req: Pick<AuthedRequest, "cookies">,
    @Res({ passthrough: true }) res: Pick<Response, "clearCookie">,
  ) {
    const parsed = ClaimBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("installationId must be a positive integer");
    }
    const token = req.cookies?.[INSTALLATION_CLAIM_COOKIE];
    const proof =
      typeof token === "string"
        ? verifyInstallationClaimToken(token, config.GITHUB_APP_WEBHOOK_SECRET ?? "")
        : null;
    if (!proof || proof.userId !== user.id || proof.installationId !== parsed.data.installationId) {
      throw new CoreException(ErrorType.WorkspaceNotFound);
    }

    const member = await this.claimFacade.claimAsOwner({
      userId: user.id,
      installationId: parsed.data.installationId,
    });
    res.clearCookie(INSTALLATION_CLAIM_COOKIE, { path: "/" });
    return member;
  }
}

import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthFacade } from "../../../application/auth/auth.facade.js";
import { config, cookieIsSecure } from "../../../config.js";
import { SessionService } from "../../../domain/auth/session.service.js";
import { createInstallationClaimToken } from "../../../domain/auth/installation-claim-token.js";
import { GitHubOAuthAdapter } from "../../../infrastructure/github/github-oauth.adapter.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import {
  type AuthedRequest,
  type AuthedUser,
  SessionAuthGuard,
} from "../common/session-auth.guard.js";

const STATE_COOKIE = "folio_oauth_state";
const SESSION_COOKIE = "folio_session";
const INSTALLATION_CLAIM_COOKIE = "folio_installation_claim";
const STATE_TTL_MS = 10 * 60 * 1000;
const INSTALLATION_CLAIM_TTL_MS = 10 * 60 * 1000;

/** Only allow same-site relative redirect targets (no open redirect). */
function safeRedirectPath(raw: string | undefined): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  return "/";
}

@Controller("api/v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthFacade) private readonly auth: AuthFacade,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(GitHubOAuthAdapter) private readonly github: GitHubOAuthAdapter,
  ) {}

  @Get("github/login")
  async login(
    @Query("redirect") redirect: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const redirectPath = safeRedirectPath(redirect);
    if (config.APP_PROFILE === "dev") {
      // Local development should not depend on a public OAuth callback URL.
      const session = await this.auth.completeDevLogin();
      this.setSessionCookie(session, res);
      res.clearCookie(STATE_COOKIE, { path: "/" });
      res.redirect(`${config.WEB_ORIGIN}${redirectPath}`);
      return;
    }

    const state = randomBytes(16).toString("hex");
    res.cookie(STATE_COOKIE, `${state}|${redirectPath}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieIsSecure(),
      maxAge: STATE_TTL_MS,
      path: "/",
    });
    res.redirect(this.github.authorizeUrl(state));
  }

  @Get("github/callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("installation_id") installationId: string | undefined,
    @Query("setup_action") setupAction: string | undefined,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    if (code && installationId !== undefined && setupAction) {
      // GitHub App installation completion does not echo our OAuth state cookie.
      const parsedInstallationId = Number(installationId);
      if (!/^[1-9]\d*$/.test(installationId) || !Number.isSafeInteger(parsedInstallationId)) {
        throw new BadRequestException("installation_id must be a positive integer");
      }
      await this.completeLoginAndRedirect(
        code,
        `/onboarding/install?installation_id=${parsedInstallationId}`,
        res,
        parsedInstallationId,
      );
      return;
    }

    const cookie = req.cookies?.[STATE_COOKIE];
    const [expectedState, redirectPath = "/"] = (cookie ?? "").split("|");
    if (!code || !state || !expectedState || state !== expectedState) {
      throw new CoreException(ErrorType.OAuthStateMismatch);
    }
    await this.completeLoginAndRedirect(code, redirectPath, res);
  }

  private async completeLoginAndRedirect(
    code: string,
    redirectPath: string,
    res: Response,
    installationId?: number,
  ): Promise<void> {
    const completion = await this.auth.completeLogin(code);
    res.clearCookie(STATE_COOKIE, { path: "/" });
    if (completion.status === "pending") {
      res.clearCookie(SESSION_COOKIE, { path: "/" });
      res.clearCookie(INSTALLATION_CLAIM_COOKIE, { path: "/" });
      res.redirect(`${config.WEB_ORIGIN}/login?status=pending`);
      return;
    }
    this.setSessionCookie(completion, res);
    if (installationId !== undefined) {
      const claimToken = createInstallationClaimToken(
        {
          userId: completion.userId,
          installationId,
          expiresAt: Date.now() + INSTALLATION_CLAIM_TTL_MS,
        },
        config.GITHUB_APP_WEBHOOK_SECRET ?? "",
      );
      res.cookie(INSTALLATION_CLAIM_COOKIE, claimToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: cookieIsSecure(),
        maxAge: INSTALLATION_CLAIM_TTL_MS,
        path: "/",
      });
    } else {
      res.clearCookie(INSTALLATION_CLAIM_COOKIE, { path: "/" });
    }
    res.redirect(`${config.WEB_ORIGIN}${safeRedirectPath(redirectPath)}`);
  }

  private setSessionCookie(session: { token: string; expiresAt: Date }, res: Response): void {
    res.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieIsSecure(),
      expires: session.expiresAt,
      path: "/",
    });
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: AuthedUser): { user: AuthedUser } {
    return { user };
  }

  @Post("logout")
  async logout(@Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    await this.sessions.destroy(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    // Hand-mirrored envelope: @Res() bypasses the global ApiResponseInterceptor.
    res.status(200).json({ success: true, data: { ok: true } });
  }
}

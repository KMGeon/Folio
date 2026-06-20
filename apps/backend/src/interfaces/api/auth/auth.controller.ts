import { randomBytes } from "node:crypto";
import { Controller, Get, Inject, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthFacade } from "../../../application/auth/auth.facade.js";
import { config, cookieIsSecure } from "../../../config.js";
import { SessionService } from "../../../domain/auth/session.service.js";
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
const STATE_TTL_MS = 10 * 60 * 1000;

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
  login(@Query("redirect") redirect: string | undefined, @Res() res: Response): void {
    const state = randomBytes(16).toString("hex");
    const redirectPath = safeRedirectPath(redirect);
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
    if (code && installationId && setupAction) {
      // GitHub App installation completion does not echo our OAuth state cookie.
      await this.completeLoginAndRedirect(code, "/", res);
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
  ): Promise<void> {
    const { token, expiresAt } = await this.auth.completeLogin(code);
    res.clearCookie(STATE_COOKIE, { path: "/" });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieIsSecure(),
      expires: expiresAt,
      path: "/",
    });
    res.redirect(`${config.WEB_ORIGIN}${safeRedirectPath(redirectPath)}`);
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

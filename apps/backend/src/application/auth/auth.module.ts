import { Module } from "@nestjs/common";
import { RepoAccessService } from "../../domain/auth/repo-access.service.js";
import { SessionService } from "../../domain/auth/session.service.js";
import { GitHubOAuthAdapter } from "../../infrastructure/github/github-oauth.adapter.js";
import { AuthController } from "../../interfaces/api/auth/auth.controller.js";
import { RepoAccessGuard } from "../../interfaces/api/common/repo-access.guard.js";
import { SessionAuthGuard } from "../../interfaces/api/common/session-auth.guard.js";
import { AuthFacade } from "./auth.facade.js";

/**
 * Wires the GitHub OAuth login + session/authorization stack. Exports the guards
 * (and their service deps) so other feature modules — e.g. ReviewModule, which
 * owns PullsController — can apply `@UseGuards(SessionAuthGuard/RepoAccessGuard)`.
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthFacade,
    SessionService,
    RepoAccessService,
    GitHubOAuthAdapter,
    SessionAuthGuard,
    RepoAccessGuard,
  ],
  exports: [
    SessionAuthGuard,
    RepoAccessGuard,
    SessionService,
    RepoAccessService,
    GitHubOAuthAdapter,
  ],
})
export class AuthModule {}

import { Module } from "@nestjs/common";
import { GitHubInstallationIdentityPort } from "../../domain/auth/github-installation-identity.port.js";
import { GitHubRepositoryPermissionPort } from "../../domain/auth/github-repository-permission.port.js";
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
    { provide: GitHubInstallationIdentityPort, useExisting: GitHubOAuthAdapter },
    { provide: GitHubRepositoryPermissionPort, useExisting: GitHubOAuthAdapter },
    SessionAuthGuard,
    RepoAccessGuard,
  ],
  exports: [
    SessionAuthGuard,
    RepoAccessGuard,
    SessionService,
    RepoAccessService,
    GitHubInstallationIdentityPort,
    GitHubRepositoryPermissionPort,
    GitHubOAuthAdapter,
  ],
})
export class AuthModule {}

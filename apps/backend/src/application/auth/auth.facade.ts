import { usersRepo } from "@folio/db";
import { Inject, Injectable } from "@nestjs/common";
import { SessionService } from "../../domain/auth/session.service.js";
import { GitHubOAuthAdapter } from "../../infrastructure/github/github-oauth.adapter.js";

@Injectable()
export class AuthFacade {
  constructor(
    @Inject(GitHubOAuthAdapter) private readonly github: GitHubOAuthAdapter,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  /** Exchange the OAuth code, upsert the GitHub identity, and open a session. */
  async completeLogin(code: string): Promise<{ token: string; expiresAt: Date }> {
    const ghUser = await this.github.exchangeCodeForUser(code);
    const user = await usersRepo.upsertByGithubId({
      githubUserId: ghUser.id,
      login: ghUser.login,
      avatarUrl: ghUser.avatarUrl,
      email: ghUser.email,
    });
    return this.sessions.createForUser(user.id);
  }
}

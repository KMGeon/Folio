import { USER_STATUS, usersRepo } from "@folio/db";
import { Inject, Injectable } from "@nestjs/common";
import { SessionService } from "../../domain/auth/session.service.js";
import { GitHubOAuthAdapter } from "../../infrastructure/github/github-oauth.adapter.js";

export type LoginCompletion =
  | { status: "approved"; token: string; expiresAt: Date }
  | { status: "pending" };

@Injectable()
export class AuthFacade {
  constructor(
    @Inject(GitHubOAuthAdapter) private readonly github: GitHubOAuthAdapter,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  /** Exchange the OAuth code and only open a session for approved users. */
  async completeLogin(code: string): Promise<LoginCompletion> {
    const ghUser = await this.github.exchangeCodeForUser(code);
    const user = await usersRepo.upsertByGithubId({
      githubUserId: ghUser.id,
      login: ghUser.login,
      avatarUrl: ghUser.avatarUrl,
      email: ghUser.email,
    });
    if (user.status !== USER_STATUS.APPROVED) {
      return { status: "pending" };
    }
    const session = await this.sessions.createForUser(user.id);
    return { status: "approved", ...session };
  }
}

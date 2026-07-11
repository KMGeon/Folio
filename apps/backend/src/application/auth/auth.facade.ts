import { usersRepo } from "@folio/db";
import { GLOBAL_STATUS } from "@folio/types";
import { Inject, Injectable } from "@nestjs/common";
import { config } from "../../config.js";
import { SessionService } from "../../domain/auth/session.service.js";
import { bootstrapSystemAdmin } from "../../domain/authorization/system-admin-bootstrap.js";
import { GitHubOAuthAdapter } from "../../infrastructure/github/github-oauth.adapter.js";

export type LoginCompletion =
  | { status: "approved"; userId: string; token: string; expiresAt: Date }
  | { status: "pending" };

const DEV_ADMIN_USER = {
  githubUserId: 1,
  login: "KMGeon",
  avatarUrl: "https://github.com/KMGeon.png?size=96",
  email: null,
  globalStatus: GLOBAL_STATUS.ACTIVE,
} as const;

@Injectable()
export class AuthFacade {
  constructor(
    @Inject(GitHubOAuthAdapter) private readonly github: GitHubOAuthAdapter,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  /** Exchange the OAuth code and only open a session for approved users. */
  async completeLogin(code: string, installationId?: number): Promise<LoginCompletion> {
    const ghUser = await this.github.exchangeCodeForUser(code, installationId);
    await usersRepo.upsertByGithubId({
      githubUserId: ghUser.id,
      login: ghUser.login,
      avatarUrl: ghUser.avatarUrl,
      email: ghUser.email,
    });
    await bootstrapSystemAdmin(ghUser.id, config.SYSTEM_ADMIN_BOOTSTRAP_GITHUB_ID);
    const refreshed = await usersRepo.getByGithubId(ghUser.id);
    if (!refreshed || refreshed.globalStatus !== GLOBAL_STATUS.ACTIVE) {
      return { status: "pending" };
    }
    const session = await this.sessions.createForUser(refreshed.id);
    return { status: "approved", userId: refreshed.id, ...session };
  }

  async completeDevLogin(): Promise<{ token: string; expiresAt: Date }> {
    const user = await usersRepo.upsertByGithubId(DEV_ADMIN_USER);
    const active =
      user.globalStatus === GLOBAL_STATUS.ACTIVE
        ? user
        : await usersRepo.setGlobalStatus(user.id, GLOBAL_STATUS.ACTIVE);
    if (!active) {
      throw new Error("Dev login could not activate the local user.");
    }
    return this.sessions.createForUser(active.id);
  }
}

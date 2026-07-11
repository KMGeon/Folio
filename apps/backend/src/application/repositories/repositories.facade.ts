import { auditLogsRepo, getDb, repositoriesRepo, usersRepo, workspaceMembersRepo } from "@folio/db";
import { AUDIT_ACTION, WORKSPACE_ROLE } from "@folio/types";
import type { Repository } from "@folio/types";
import { Inject, Injectable } from "@nestjs/common";
import { canAccessWorkspace } from "../../domain/authorization/authorization-policy.js";
import { RepoAccessService } from "../../domain/auth/repo-access.service.js";
import { WorkspaceResolver } from "../../infrastructure/authorization/workspace-resolver.js";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";

const REPOSITORY_NOT_FOUND = {
  code: "repository_not_found",
  statusCode: 404,
  message: "Repository not found.",
} as const;

export interface RepositoryListPayload {
  repositories: Repository[];
}

export interface ToggleRepositoryInput {
  user: { id: string; login: string };
  repositoryId: string;
  enabled: boolean;
}

@Injectable()
export class RepositoriesFacade {
  constructor(
    @Inject(WorkspaceResolver) private readonly workspaceResolver: WorkspaceResolver,
    @Inject(RepoAccessService) private readonly repoAccess: RepoAccessService,
  ) {}

  async listForUser(user: { userId: string; login: string }): Promise<RepositoryListPayload> {
    const workspace = await this.workspaceResolver.firstWorkspaceForUser(user.userId);
    if (!workspace) {
      return { repositories: [] };
    }
    const [actor, membership] = await Promise.all([
      usersRepo.getById(user.userId),
      workspaceMembersRepo.getMembership(workspace.id, user.userId),
    ]);
    if (
      !actor ||
      !membership ||
      !canAccessWorkspace(
        { globalStatus: actor.globalStatus, isSystemAdmin: actor.isSystemAdmin },
        { role: membership.role, status: membership.status },
        WORKSPACE_ROLE.REVIEWER,
      ).allow
    ) {
      throw new CoreException(ErrorType.Forbidden);
    }
    const repos = await repositoriesRepo.listByWorkspaceId(workspace.id);
    return { repositories: repos.map(toRepository) };
  }

  async setEnabled(input: ToggleRepositoryInput): Promise<Repository> {
    const workspace = await this.workspaceResolver.firstWorkspaceForUser(input.user.id);
    if (!workspace) {
      throw new CoreException(ErrorType.WorkspaceNotFound);
    }

    return getDb().transaction(async (transaction) => {
      const repo = await repositoriesRepo.getByIdForUpdate(input.repositoryId, transaction);
      // Cross-workspace IDs are indistinguishable from missing rows to callers.
      if (!repo || repo.workspaceId !== workspace.id) {
        throw new CoreException(REPOSITORY_NOT_FOUND);
      }

      const [actor, membership] = await Promise.all([
        usersRepo.getById(input.user.id, transaction),
        workspaceMembersRepo.getMembership(workspace.id, input.user.id, transaction),
      ]);
      if (
        !actor ||
        !membership ||
        !canAccessWorkspace(
          { globalStatus: actor.globalStatus, isSystemAdmin: actor.isSystemAdmin },
          { role: membership.role, status: membership.status },
          WORKSPACE_ROLE.ADMIN,
        ).allow
      ) {
        throw new CoreException(ErrorType.Forbidden);
      }

      const githubAdmin = await this.repoAccess.assertLevelAtLeast(
        { owner: repo.owner, repo: repo.name, username: input.user.login },
        "admin",
      );
      if (!githubAdmin) {
        throw new CoreException(ErrorType.RepoAccessDenied);
      }
      if (repo.folioEnabled === input.enabled) {
        return toRepository(repo);
      }

      const updated = await repositoriesRepo.setFolioEnabled(repo.id, input.enabled, transaction);
      await auditLogsRepo.record(
        {
          actorUserId: input.user.id,
          action: AUDIT_ACTION.REPO_ACTIVATION_CHANGE,
          targetType: "repository",
          targetId: repo.id,
          workspaceId: workspace.id,
          before: { folioEnabled: repo.folioEnabled },
          after: { folioEnabled: input.enabled },
        },
        transaction,
      );
      return toRepository(updated);
    });
  }
}

function toRepository(row: {
  id: string;
  installationId: string;
  githubRepoId: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  folioEnabled: boolean;
}): Repository {
  return {
    id: row.id,
    installationId: row.installationId,
    githubRepoId: row.githubRepoId,
    owner: row.owner,
    name: row.name,
    fullName: row.fullName,
    private: row.private,
    defaultBranch: row.defaultBranch,
    folioEnabled: row.folioEnabled,
  };
}

import {
  auditLogsRepo,
  getDb,
  installationsRepo,
  repositoriesRepo,
  usersRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import { AUDIT_ACTION, WORKSPACE_ROLE } from "@folio/types";
import type { Repository } from "@folio/types";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { canAccessWorkspace } from "../../domain/authorization/authorization-policy.js";
import { RepoAccessService } from "../../domain/auth/repo-access.service.js";
import { WorkspaceResolver } from "../../infrastructure/authorization/workspace-resolver.js";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";
import { PullRequestIndexBackfill } from "../dashboard/pull-request-index-backfill.js";
import { PullRequestIndexWriter } from "../dashboard/pull-request-index-writer.js";

const REPOSITORY_NOT_FOUND = {
  code: "repository_not_found",
  statusCode: 404,
  message: "Repository not found.",
} as const;

export interface RepositoryListPayload {
  githubInstallationId: number | null;
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
    @Optional()
    @Inject(PullRequestIndexBackfill)
    private readonly indexBackfill?: PullRequestIndexBackfill,
    @Optional()
    @Inject(PullRequestIndexWriter)
    private readonly indexWriter?: PullRequestIndexWriter,
  ) {}

  async listForUser(
    user: { userId: string; login: string },
    preferredWorkspaceId?: string,
  ): Promise<RepositoryListPayload> {
    const workspace = await this.workspaceResolver.workspaceForUser(
      user.userId,
      preferredWorkspaceId,
    );
    if (!workspace) {
      return { githubInstallationId: null, repositories: [] };
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
    const [repos, installations] = await Promise.all([
      repositoriesRepo.listByWorkspaceId(workspace.id),
      installationsRepo.listByWorkspaceAccountId(workspace.githubAccountId),
    ]);
    // GitHub installation ids increase over time, so the newest active row wins if legacy data is corrupt.
    const activeInstallation = installations
      .filter((installation) => installation.suspendedAt === null)
      .sort((left, right) => right.githubInstallationId - left.githubInstallationId)[0];
    return {
      githubInstallationId: activeInstallation?.githubInstallationId ?? null,
      repositories: repos.map(toRepository),
    };
  }

  async setEnabled(
    input: ToggleRepositoryInput,
    preferredWorkspaceId?: string,
  ): Promise<Repository> {
    const workspace = await this.workspaceResolver.workspaceForUser(
      input.user.id,
      preferredWorkspaceId,
    );
    if (!workspace) {
      throw new CoreException(ErrorType.WorkspaceNotFound);
    }

    const [repo, actor, membership] = await Promise.all([
      repositoriesRepo.getById(input.repositoryId),
      usersRepo.getById(input.user.id),
      workspaceMembersRepo.getMembership(workspace.id, input.user.id),
    ]);
    if (!repo || repo.workspaceId !== workspace.id) {
      throw new CoreException(REPOSITORY_NOT_FOUND);
    }
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

    // Live GitHub checks can be cold; complete them before holding any database row lock.
    const githubAdmin = await this.repoAccess.assertLiveLevelAtLeast(
      { owner: repo.owner, repo: repo.name, username: input.user.login },
      "admin",
    );
    if (!githubAdmin) {
      throw new CoreException(ErrorType.RepoAccessDenied);
    }

    const result = await getDb().transaction(async (transaction) => {
      const lockedWorkspace = await workspacesRepo.getByIdForUpdate(workspace.id, transaction);
      if (!lockedWorkspace) {
        throw new CoreException(ErrorType.WorkspaceNotFound);
      }
      const lockedMemberships = await workspaceMembersRepo.getMembershipsForUpdate(
        workspace.id,
        [input.user.id],
        transaction,
      );
      const lockedMembership = lockedMemberships.find(
        (candidate) => candidate.userId === input.user.id,
      );
      const lockedActor = await usersRepo.getByIdForUpdate(input.user.id, transaction);
      if (
        !lockedActor ||
        !lockedMembership ||
        !canAccessWorkspace(
          {
            globalStatus: lockedActor.globalStatus,
            isSystemAdmin: lockedActor.isSystemAdmin,
          },
          { role: lockedMembership.role, status: lockedMembership.status },
          WORKSPACE_ROLE.ADMIN,
        ).allow
      ) {
        throw new CoreException(ErrorType.Forbidden);
      }

      const lockedRepo = await repositoriesRepo.getByIdForUpdate(input.repositoryId, transaction);
      // Cross-workspace or changed authorization targets remain indistinguishable from missing rows.
      if (
        !lockedRepo ||
        lockedRepo.workspaceId !== workspace.id ||
        lockedRepo.owner !== repo.owner ||
        lockedRepo.name !== repo.name
      ) {
        throw new CoreException(REPOSITORY_NOT_FOUND);
      }

      // Revalidate connectivity under the repository lock so stale settings pages fail closed.
      if (!lockedRepo.githubAccessActive) {
        throw new CoreException(ErrorType.RepositoryDisconnected);
      }

      if (lockedRepo.folioEnabled === input.enabled) {
        return {
          repository: toRepository(lockedRepo),
          repositoryId: lockedRepo.id,
          enabled: input.enabled,
          changed: false,
        };
      }

      const updated = await repositoriesRepo.setFolioEnabled(
        lockedRepo.id,
        input.enabled,
        transaction,
      );
      await auditLogsRepo.record(
        {
          actorUserId: input.user.id,
          action: AUDIT_ACTION.REPO_ACTIVATION_CHANGE,
          targetType: "repository",
          targetId: lockedRepo.id,
          workspaceId: workspace.id,
          before: { folioEnabled: lockedRepo.folioEnabled },
          after: { folioEnabled: input.enabled },
        },
        transaction,
      );
      return {
        repository: toRepository(updated),
        repositoryId: lockedRepo.id,
        enabled: input.enabled,
        changed: true,
      };
    });

    // Index backfill/clear runs after commit so webhook-adjacent jobs see committed state.
    if (result.changed) {
      await (result.enabled
        ? this.indexBackfill?.enqueueForRepository(result.repositoryId)
        : this.indexWriter?.clearRepo(result.repositoryId));
    }
    return result.repository;
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
  githubAccessActive: boolean;
  aiReplyEnabled: boolean;
  priority: "high" | "normal" | "low";
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
    githubAccessActive: row.githubAccessActive,
    aiReplyEnabled: row.aiReplyEnabled,
    priority: row.priority,
  };
}

import {
  auditLogsRepo,
  getDb,
  repositoriesRepo,
  usersRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import {
  AUDIT_ACTION,
  type Repository,
  type RepositoryPriority,
  WORKSPACE_ROLE,
} from "@folio/types";
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

export type SetRepositoryPreferencesInput = {
  user: { id: string; login: string };
  repositoryId: string;
  aiReplyEnabled?: boolean;
  priority?: RepositoryPriority;
};

@Injectable()
export class RepositoryPreferencesFacade {
  constructor(
    @Inject(WorkspaceResolver) private readonly workspaceResolver: WorkspaceResolver,
    @Inject(RepoAccessService) private readonly repoAccess: RepoAccessService,
  ) {}

  async setPreferences(
    input: SetRepositoryPreferencesInput,
    preferredWorkspaceId?: string,
  ): Promise<Repository> {
    const workspace = await this.workspaceResolver.workspaceForUser(
      input.user.id,
      preferredWorkspaceId,
    );
    if (!workspace) {
      throw new CoreException(ErrorType.WorkspaceNotFound);
    }
    const [repository, actor, membership] = await Promise.all([
      repositoriesRepo.getById(input.repositoryId),
      usersRepo.getById(input.user.id),
      workspaceMembersRepo.getMembership(workspace.id, input.user.id),
    ]);
    if (!repository || repository.workspaceId !== workspace.id) {
      throw new CoreException(REPOSITORY_NOT_FOUND);
    }
    if (!isWorkspaceAdmin(actor, membership)) {
      throw new CoreException(ErrorType.Forbidden);
    }
    const githubAdmin = await this.repoAccess.assertLiveLevelAtLeast(
      { owner: repository.owner, repo: repository.name, username: input.user.login },
      "admin",
    );
    if (!githubAdmin) {
      throw new CoreException(ErrorType.RepoAccessDenied);
    }

    return getDb().transaction(async (transaction) => {
      const lockedWorkspace = await workspacesRepo.getByIdForUpdate(workspace.id, transaction);
      if (!lockedWorkspace) {
        throw new CoreException(ErrorType.WorkspaceNotFound);
      }
      const [lockedActor, lockedRepository, lockedMemberships] = await Promise.all([
        usersRepo.getByIdForUpdate(input.user.id, transaction),
        repositoriesRepo.getByIdForUpdate(input.repositoryId, transaction),
        workspaceMembersRepo.getMembershipsForUpdate(workspace.id, [input.user.id], transaction),
      ]);
      const lockedMembership = lockedMemberships.find(
        (candidate) => candidate.userId === input.user.id,
      );
      if (!isWorkspaceAdmin(lockedActor, lockedMembership)) {
        throw new CoreException(ErrorType.Forbidden);
      }
      if (
        !lockedRepository ||
        lockedRepository.workspaceId !== workspace.id ||
        lockedRepository.owner !== repository.owner ||
        lockedRepository.name !== repository.name
      ) {
        throw new CoreException(REPOSITORY_NOT_FOUND);
      }
      if (!lockedRepository.githubAccessActive) {
        throw new CoreException(ErrorType.RepositoryDisconnected);
      }
      const changes = preferenceChanges(input);
      if (!preferenceChanged(lockedRepository, changes)) {
        return toRepository(lockedRepository);
      }
      const updated = await repositoriesRepo.updatePreferences(
        lockedRepository.id,
        changes,
        transaction,
      );
      await auditLogsRepo.record(
        {
          actorUserId: input.user.id,
          action: AUDIT_ACTION.REPO_SETTINGS_CHANGE,
          targetType: "repository",
          targetId: lockedRepository.id,
          workspaceId: workspace.id,
          before: preferenceSnapshot(lockedRepository),
          after: preferenceSnapshot(updated),
        },
        transaction,
      );
      return toRepository(updated);
    });
  }
}

function isWorkspaceAdmin(
  actor: { globalStatus: "pending" | "active" | "suspended"; isSystemAdmin: boolean } | null,
  membership:
    | { role: (typeof WORKSPACE_ROLE)[keyof typeof WORKSPACE_ROLE]; status: "active" | "suspended" }
    | null
    | undefined,
): boolean {
  return Boolean(
    actor &&
    membership &&
    canAccessWorkspace(
      { globalStatus: actor.globalStatus, isSystemAdmin: actor.isSystemAdmin },
      { role: membership.role, status: membership.status },
      WORKSPACE_ROLE.ADMIN,
    ).allow,
  );
}

function preferenceChanges(input: SetRepositoryPreferencesInput) {
  return {
    ...(input.aiReplyEnabled === undefined ? {} : { aiReplyEnabled: input.aiReplyEnabled }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
  };
}

function preferenceChanged(
  repository: { aiReplyEnabled: boolean; priority: RepositoryPriority },
  changes: ReturnType<typeof preferenceChanges>,
): boolean {
  return (
    (changes.aiReplyEnabled !== undefined &&
      changes.aiReplyEnabled !== repository.aiReplyEnabled) ||
    (changes.priority !== undefined && changes.priority !== repository.priority)
  );
}

function preferenceSnapshot(repository: { aiReplyEnabled: boolean; priority: RepositoryPriority }) {
  return { aiReplyEnabled: repository.aiReplyEnabled, priority: repository.priority };
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
  priority: RepositoryPriority;
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

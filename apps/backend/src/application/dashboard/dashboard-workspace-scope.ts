import {
  type InstallationRow,
  PR_INDEX_STATUS,
  type RepositoryRow,
  type WorkspaceRow,
  installationsRepo,
  repositoriesRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import { MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";

export interface DashboardWorkspaceScope {
  workspaces: WorkspaceRow[];
  installations: InstallationRow[];
  repositories: RepositoryRow[];
}

export type DashboardResolvedRepositoryBatchAuthorizer = (input: {
  installations: readonly InstallationRow[];
  repositories: readonly RepositoryRow[];
  username: string;
}) => Promise<RepositoryRow[]>;

export type DashboardWorkspaceScopeOptions = {
  boardRead?: boolean;
  indexRead?: boolean;
};

export async function loadDashboardWorkspaceScope(
  userId: string,
  userLogin: string,
  filterReadableRepositories: DashboardResolvedRepositoryBatchAuthorizer,
  options: DashboardWorkspaceScopeOptions = {},
): Promise<DashboardWorkspaceScope | null> {
  const memberships = await workspaceMembersRepo.listByUser(userId);
  if (memberships.length === 0) {
    return null;
  }
  const readableMemberships = memberships.filter(
    (membership) =>
      membership.status === MEMBERSHIP_STATUS.ACTIVE &&
      Object.values(WORKSPACE_ROLE).includes(membership.role),
  );
  if (readableMemberships.length === 0) {
    throw new CoreException(ErrorType.Forbidden);
  }
  const workspaceIds = [
    ...new Set(readableMemberships.map((membership) => membership.workspaceId)),
  ];
  const workspaces = (
    await Promise.all(workspaceIds.map((workspaceId) => workspacesRepo.getById(workspaceId)))
  ).filter((workspace): workspace is WorkspaceRow => workspace !== null);
  if (workspaces.length === 0) {
    return null;
  }

  // The review desk is a user-wide inbox, so combine personal and organization workspaces.
  const workspaceScopes = await Promise.all(
    workspaces.map(async (workspace) => {
      const [installations, repositories] = await Promise.all([
        installationsRepo.listByWorkspaceAccountId(workspace.githubAccountId),
        repositoriesRepo.listByWorkspaceId(workspace.id),
      ]);
      return { installations, repositories };
    }),
  );
  const installations = workspaceScopes.flatMap((scope) => scope.installations);
  const repositories = workspaceScopes.flatMap((scope) => scope.repositories);
  const boardCandidates = options.boardRead
    ? repositories.filter(
        (repository) =>
          repository.folioEnabled &&
          (!options.indexRead || repository.prIndexStatus === PR_INDEX_STATUS.READY),
      )
    : repositories;
  const authorizedRepositories = await filterReadableRepositories({
    installations,
    // Board reads can never expose disabled or unindexed repositories, so avoid live checks for them.
    repositories: boardCandidates,
    username: userLogin,
  });
  return { workspaces, installations, repositories: authorizedRepositories };
}

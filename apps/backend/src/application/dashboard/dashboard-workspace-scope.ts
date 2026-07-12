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
  workspace: WorkspaceRow;
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
  const [membership] = await workspaceMembersRepo.listByUser(userId);
  if (!membership) {
    return null;
  }
  const reviewerOrHigher = Object.values(WORKSPACE_ROLE).includes(membership.role);
  if (membership.status !== MEMBERSHIP_STATUS.ACTIVE || !reviewerOrHigher) {
    throw new CoreException(ErrorType.Forbidden);
  }
  const workspace = await workspacesRepo.getById(membership.workspaceId);
  if (!workspace) {
    return null;
  }
  const [installations, repositories] = await Promise.all([
    installationsRepo.listByWorkspaceAccountId(workspace.githubAccountId),
    repositoriesRepo.listByWorkspaceId(workspace.id),
  ]);
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
  return { workspace, installations, repositories: authorizedRepositories };
}

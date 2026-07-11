import {
  type InstallationRow,
  type RepositoryRow,
  type WorkspaceRow,
  installationsRepo,
  repositoriesRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import { MEMBERSHIP_STATUS } from "@folio/types";

export interface DashboardWorkspaceScope {
  workspace: WorkspaceRow;
  installations: InstallationRow[];
  repositories: RepositoryRow[];
}

export async function loadDashboardWorkspaceScope(
  userId: string,
): Promise<DashboardWorkspaceScope | null> {
  const [membership] = await workspaceMembersRepo.listByUser(userId);
  if (!membership || membership.status !== MEMBERSHIP_STATUS.ACTIVE) {
    return null;
  }
  const workspace = await workspacesRepo.getById(membership.workspaceId);
  if (!workspace) {
    return null;
  }
  const [installations, repositories] = await Promise.all([
    installationsRepo.listByWorkspaceAccountId(workspace.githubAccountId),
    repositoriesRepo.listByWorkspaceId(workspace.id),
  ]);
  return { workspace, installations, repositories };
}

import {
  type WorkspaceRow,
  installationsRepo,
  repositoriesRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import { Injectable } from "@nestjs/common";

@Injectable()
export class WorkspaceResolver {
  resolveByGithubAccountId(githubAccountId: number): Promise<WorkspaceRow | null> {
    return workspacesRepo.getByGithubAccountId(githubAccountId);
  }

  resolveById(workspaceId: string): Promise<WorkspaceRow | null> {
    return workspacesRepo.getById(workspaceId);
  }

  async resolveForRepoId(githubRepoId: number): Promise<WorkspaceRow | null> {
    const repository = await repositoriesRepo.getByGithubId(githubRepoId);
    if (!repository?.workspaceId) {
      return null;
    }
    return workspacesRepo.getById(repository.workspaceId);
  }

  listInstallationsForWorkspace(githubAccountId: number) {
    return installationsRepo.listByWorkspaceAccountId(githubAccountId);
  }

  async firstWorkspaceForUser(userId: string): Promise<WorkspaceRow | null> {
    return this.workspaceForUser(userId);
  }

  async workspaceForUser(
    userId: string,
    preferredWorkspaceId?: string,
  ): Promise<WorkspaceRow | null> {
    const memberships = await workspaceMembersRepo.listByUser(userId);
    const membership =
      memberships.find((candidate) => candidate.workspaceId === preferredWorkspaceId) ??
      memberships[0];
    return membership ? workspacesRepo.getById(membership.workspaceId) : null;
  }
}

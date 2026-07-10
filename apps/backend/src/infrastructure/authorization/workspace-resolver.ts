import { type WorkspaceRow, installationsRepo, repositoriesRepo, workspacesRepo } from "@folio/db";
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
}

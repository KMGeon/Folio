import { Injectable, NotFoundException } from "@nestjs/common";
import { installationsRepo, repositoriesRepo } from "@folio/db";
import type { Repository } from "@folio/types";

export interface RepositoryListPayload {
  repositories: Repository[];
}

export interface ToggleRepositoryInput {
  user: { login: string };
  repositoryId: string;
  enabled: boolean;
}

@Injectable()
export class RepositoriesFacade {
  async listForUser(user: { login: string }): Promise<RepositoryListPayload> {
    const installations = await installationsRepo.listByAccountLogin(user.login);
    const repos = await repositoriesRepo.listByInstallationIds(installations.map((i) => i.id));
    return { repositories: repos.map(toRepository) };
  }

  async setEnabled(input: ToggleRepositoryInput): Promise<Repository> {
    const installations = await installationsRepo.listByAccountLogin(input.user.login);
    const installationIds = installations.map((i) => i.id);
    const repos = await repositoriesRepo.listByInstallationIds(installationIds);
    const repo = repos.find((candidate) => candidate.id === input.repositoryId);
    if (!repo) {
      throw new NotFoundException("Repository not found");
    }
    const updated = await repositoriesRepo.setFolioEnabled(input.repositoryId, input.enabled);
    return toRepository(updated);
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

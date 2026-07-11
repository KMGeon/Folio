import { apiRequest } from "./api-client";

export interface RepositorySummary {
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
}

export interface RepositoryListPayload {
  githubInstallationId: number | null;
  repositories: RepositorySummary[];
}

export interface FetchRepositoriesOptions {
  cookie?: string;
}

export function fetchRepositories(opts?: FetchRepositoriesOptions): Promise<RepositoryListPayload> {
  return opts?.cookie
    ? apiRequest<RepositoryListPayload>("/api/v1/repositories", {
        headers: { cookie: opts.cookie },
      })
    : apiRequest<RepositoryListPayload>("/api/v1/repositories");
}

export async function setRepositoryEnabled(
  repositoryId: string,
  enabled: boolean,
  cookie?: string,
): Promise<RepositorySummary> {
  return apiRequest<RepositorySummary>(`/api/v1/repositories/${repositoryId}/enabled`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ enabled }),
  });
}

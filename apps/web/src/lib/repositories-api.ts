import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ApiError, apiRequest } from "./api-client";

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
}

export interface RepositoryListPayload {
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

export async function toggleRepositoryEnabled(formData: FormData) {
  "use server";

  const repositoryId = String(formData.get("repositoryId") ?? "");
  const enabled = formData.get("enabled") === "true";
  if (!repositoryId) {
    throw new Error("repositoryId is required");
  }

  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  try {
    await setRepositoryEnabled(repositoryId, enabled, cookieHeader);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login?redirect=/settings/repositories");
    }
    throw err;
  }

  revalidatePath("/");
  revalidatePath("/settings/repositories");
}

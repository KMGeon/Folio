import type { Octokit } from "octokit";

export type GitHubRepoAccessLevel = "none" | "read" | "write" | "admin";

// GitHub's collaborator-permission strings collapse to four action-gating tiers;
// "maintain" and "triage" sit between write/read but don't warrant their own tier here.
const LEVELS: Record<string, GitHubRepoAccessLevel> = {
  admin: "admin",
  maintain: "admin",
  write: "write",
  triage: "read",
  read: "read",
  none: "none",
};

/**
 * Effective permission level of `username` on `owner/repo`, checked with an
 * *installation* token (design Model B). GitHub returns the effective
 * permission level (admin/write/read/none) accounting for org/team access;
 * 404 means the user is not a collaborator → "none".
 */
export async function getUserRepoPermissionLevel(
  client: Octokit,
  input: { owner: string; repo: string; username: string },
): Promise<GitHubRepoAccessLevel> {
  try {
    const res = await client.rest.repos.getCollaboratorPermissionLevel({
      owner: input.owner,
      repo: input.repo,
      username: input.username,
    });
    return LEVELS[res.data.permission] ?? "none";
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { status?: number }).status === 404
    ) {
      return "none";
    }
    throw error;
  }
}

/** Back-compat boolean wrapper for existing "any access" callers. */
export async function checkUserRepoPermission(
  client: Octokit,
  input: { owner: string; repo: string; username: string },
): Promise<boolean> {
  return (await getUserRepoPermissionLevel(client, input)) !== "none";
}

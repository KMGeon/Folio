import type { Octokit } from "octokit";

/**
 * Whether `username` can read `owner/repo`, checked with an *installation*
 * token (design Model B). GitHub returns the effective permission level
 * (admin/write/read/none) accounting for org/team access; 404 means the user
 * is not a collaborator → no access.
 */
export async function checkUserRepoPermission(
  client: Octokit,
  input: { owner: string; repo: string; username: string },
): Promise<boolean> {
  try {
    const res = await client.rest.repos.getCollaboratorPermissionLevel({
      owner: input.owner,
      repo: input.repo,
      username: input.username,
    });
    return res.data.permission !== "none";
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { status?: number }).status === 404
    ) {
      return false;
    }
    throw error;
  }
}

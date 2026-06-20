/**
 * Identifies a single pull request.
 * (`GitHubRepo`) + the PR number, but here it is a plain server-side value:
 * Folio always knows owner/repo/number from the webhook payload, so there is no
 * git-remote parsing.
 */
export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

/**
 * Parse an `owner/repo` full name (as GitHub returns in `repository.full_name`).
 * Parses a bare `owner/repo` repository name.
 * shape the webhook payloads carry rather than a git origin URL.
 *
 * @throws if the input is not exactly `owner/repo` with both segments non-empty.
 */
export function parseRepoFullName(full: string): { owner: string; repo: string } {
  const trimmed = full.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) {
    throw new Error(`Invalid repository full name: "${full}" (expected "owner/repo")`);
  }
  const owner = trimmed.slice(0, slash);
  const repo = trimmed.slice(slash + 1);
  if (!owner || !repo || repo.includes("/")) {
    throw new Error(`Invalid repository full name: "${full}" (expected "owner/repo")`);
  }
  return { owner, repo };
}

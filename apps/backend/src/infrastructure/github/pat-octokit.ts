import { Octokit } from "octokit";

/** Octokit authenticated with a personal access token (manual review trigger). */
export function createPatOctokit(token: string): Octokit {
  if (!token) {
    throw new Error("createPatOctokit: a non-empty GitHub token is required");
  }
  return new Octokit({ auth: token });
}

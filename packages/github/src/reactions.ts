import type { Octokit } from "octokit";
import type { PullRequestRef } from "./ref.js";

/** GitHub issue/PR reaction content values we use for Folio status signals. */
export type IssueReactionContent =
  | "+1"
  | "-1"
  | "laugh"
  | "confused"
  | "heart"
  | "hooray"
  | "rocket"
  | "eyes";

/**
 * React on the main PR/issue body (not a comment). Used as a lightweight
 * "queued" signal when a review job is enqueued.
 *
 * Best-effort callers should catch errors: missing App permissions or an
 * existing identical reaction must not fail the webhook 202 path.
 */
export async function createIssueReaction(
  client: Octokit,
  ref: PullRequestRef,
  content: IssueReactionContent,
): Promise<{ id: number }> {
  try {
    const { data } = await client.rest.reactions.createForIssue({
      owner: ref.owner,
      repo: ref.repo,
      issue_number: ref.number,
      content,
    });
    return { id: data.id };
  } catch (err) {
    throw new Error(`Failed to create issue reaction (${content}): ${errMessage(err)}`);
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

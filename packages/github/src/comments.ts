import type { Octokit } from "octokit";
import type { PullRequestRef } from "./ref.js";

export interface IssueComment {
  id: number;
  body: string;
  user: string;
}

/**
 * HTML-comment marker hidden in the bot comment body. GitHub renders it
 * invisibly, so we can find "our" comment on re-runs and edit it in place
 * instead of spamming a new comment each time (I3's edit-in-place behavior).
 */
export function commentMarker(key: string): string {
  return `<!-- folio:${key} -->`;
}

/** Append the hidden marker to a comment body. */
export function withMarker(body: string, key: string): string {
  return `${body}\n\n${commentMarker(key)}`;
}

/** Create an issue/PR comment. Writes surface errors to the caller. */
export async function createIssueComment(
  client: Octokit,
  ref: PullRequestRef,
  body: string,
): Promise<{ id: number }> {
  try {
    const { data } = await client.rest.issues.createComment({
      owner: ref.owner,
      repo: ref.repo,
      issue_number: ref.number,
      body,
    });
    return { id: data.id };
  } catch (err) {
    throw new Error(`Failed to create issue comment: ${errMessage(err)}`);
  }
}

/** Update an existing issue/PR comment by id. */
export async function updateIssueComment(
  client: Octokit,
  ref: PullRequestRef,
  commentId: number,
  body: string,
): Promise<void> {
  try {
    await client.rest.issues.updateComment({
      owner: ref.owner,
      repo: ref.repo,
      comment_id: commentId,
      body,
    });
  } catch (err) {
    throw new Error(`Failed to update issue comment ${commentId}: ${errMessage(err)}`);
  }
}

/** List issue/PR comments (read-tolerant: returns [] on failure). */
export async function listIssueComments(
  client: Octokit,
  ref: PullRequestRef,
): Promise<IssueComment[]> {
  try {
    const comments = await client.paginate(client.rest.issues.listComments, {
      owner: ref.owner,
      repo: ref.repo,
      issue_number: ref.number,
      per_page: 100,
    });
    return comments.map((c) => ({
      id: c.id,
      body: c.body ?? "",
      user: c.user?.login ?? "",
    }));
  } catch {
    return [];
  }
}

/** Find the first comment carrying `commentMarker(key)`, or null. */
export function findMarkedComment(comments: IssueComment[], key: string): IssueComment | null {
  const marker = commentMarker(key);
  return comments.find((c) => c.body.includes(marker)) ?? null;
}

/**
 * Edit-in-place upsert: find the comment bearing the marker and update it, else
 * create a fresh marked comment. Powers I3's single-comment-per-PR behavior.
 */
export async function upsertMarkedComment(
  client: Octokit,
  ref: PullRequestRef,
  key: string,
  body: string,
): Promise<{ id: number; created: boolean }> {
  const finalBody = withMarker(body, key);
  const existing = findMarkedComment(await listIssueComments(client, ref), key);
  if (existing) {
    await updateIssueComment(client, ref, existing.id, finalBody);
    return { id: existing.id, created: false };
  }
  const { id } = await createIssueComment(client, ref, finalBody);
  return { id, created: true };
}

function errMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

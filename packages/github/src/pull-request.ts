import { REVIEW_STATE, type ReviewState } from "@folio/types";
import type { Octokit } from "octokit";
import type { PullRequestRef } from "./ref.js";

// ─── GitHub REST envelope types (defined here, not in @folio/types) ──────────

export interface PullRequestSummary {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  htmlUrl: string;
  authorLogin: string | null;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
  createdAt: string;
  updatedAt: string;
}

export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  /** Per-file unified diff hunk (absent for binary files). */
  patch?: string;
  previousFilename?: string;
}

export interface PullRequestCommit {
  sha: string;
  /** Full commit message (first line is used as a grouping hint downstream). */
  message: string;
  /** Author login (falls back to the git author name when no GitHub user). */
  author: string;
  /** ISO-8601 authored timestamp, or "" when GitHub omits it. */
  authoredAt: string;
  /** Parent commit SHAs — drives branch/merge lanes in the commit graph. */
  parents: string[];
}

export interface ReviewSummary {
  id: number;
  reviewerLogin: string | null;
  /** Mapped onto @folio/types ReviewState; `null` for states we don't model. */
  state: ReviewState | null;
  submittedAt: string | null;
  commitSha: string | null;
}

export interface ReviewCommentSummary {
  id: number;
  reviewerLogin: string | null;
  path: string;
  body: string;
  line: number | null;
  commitSha: string;
}

const PER_PAGE = 100;

/** GitHub's review `state` strings map onto our REVIEW_STATE enum. */
function mapReviewState(state: string): ReviewState | null {
  switch (state.toUpperCase()) {
    case "APPROVED":
      return REVIEW_STATE.APPROVED;
    case "CHANGES_REQUESTED":
      return REVIEW_STATE.CHANGES_REQUESTED;
    case "COMMENTED":
      return REVIEW_STATE.COMMENTED;
    case "DISMISSED":
      return REVIEW_STATE.DISMISSED;
    case "PENDING":
      return REVIEW_STATE.PENDING;
    default:
      return null;
  }
}

/** Fetch a PR's metadata, normalized onto {@link PullRequestSummary}. */
export async function getPullRequest(
  client: Octokit,
  ref: PullRequestRef,
): Promise<PullRequestSummary> {
  const { data } = await client.rest.pulls.get({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
  });
  return {
    number: data.number,
    title: data.title,
    body: data.body ?? null,
    state: data.state,
    merged: data.merged ?? false,
    draft: data.draft ?? false,
    htmlUrl: data.html_url,
    authorLogin: data.user?.login ?? null,
    headRef: data.head.ref,
    headSha: data.head.sha,
    baseRef: data.base.ref,
    baseSha: data.base.sha,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Fetch the raw unified diff for a PR via the `application/vnd.github.diff`
 * media type. The string is consumable directly by `@folio/diff` (E1).
 */
export async function getPullRequestDiff(client: Octokit, ref: PullRequestRef): Promise<string> {
  const res = await client.rest.pulls.get({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
    mediaType: { format: "diff" },
  });
  // With the diff media type GitHub returns the raw text body; Octokit's types
  // still describe the JSON shape, so `data` is the diff string at runtime.
  return res.data as unknown as string;
}

/**
 * List a PR's commits (oldest→newest), paginating at 100/page. Commit messages
 * are a strong author-authored grouping signal for the decomposition LLM.
 */
export async function getPullRequestCommits(
  client: Octokit,
  ref: PullRequestRef,
): Promise<PullRequestCommit[]> {
  const commits = await client.paginate(client.rest.pulls.listCommits, {
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
    per_page: PER_PAGE,
  });
  // author/date/parents all ship in the same listCommits payload — no extra calls.
  return commits.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.author?.login ?? c.commit.author?.name ?? "unknown",
    authoredAt: c.commit.author?.date ?? c.commit.committer?.date ?? "",
    parents: c.parents?.map((p) => p.sha) ?? [],
  }));
}

/**
 * List every changed file in a PR, paginating at 100/page until exhausted, so
 * PRs with >100 files are fully covered.
 */
export async function listPullRequestFiles(
  client: Octokit,
  ref: PullRequestRef,
): Promise<PullRequestFile[]> {
  const files = await client.paginate(client.rest.pulls.listFiles, {
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
    per_page: PER_PAGE,
  });
  return files.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    patch: f.patch,
    previousFilename: f.previous_filename,
  }));
}

/**
 * Read PR reviews mapped onto @folio/types `ReviewState`. Read-tolerant in
 * callers get a normalized list; unmapped states
 * surface as `null` rather than throwing.
 */
export async function getReviews(client: Octokit, ref: PullRequestRef): Promise<ReviewSummary[]> {
  const reviews = await client.paginate(client.rest.pulls.listReviews, {
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
    per_page: PER_PAGE,
  });
  return reviews.map((r) => ({
    id: r.id,
    reviewerLogin: r.user?.login ?? null,
    state: mapReviewState(r.state),
    submittedAt: r.submitted_at ?? null,
    commitSha: r.commit_id ?? null,
  }));
}

/** Read inline (per-file) review comments on a PR. */
export async function getReviewComments(
  client: Octokit,
  ref: PullRequestRef,
): Promise<ReviewCommentSummary[]> {
  const comments = await client.paginate(client.rest.pulls.listReviewComments, {
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
    per_page: PER_PAGE,
  });
  return comments.map((c) => ({
    id: c.id,
    reviewerLogin: c.user?.login ?? null,
    path: c.path,
    body: c.body,
    line: c.line ?? null,
    commitSha: c.commit_id,
  }));
}

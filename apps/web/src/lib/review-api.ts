import { apiRequest } from "./api-client";

export interface ReviewDiffLine {
  n: number;
  kind: "add" | "del" | "ctx";
  text: string;
}

export interface ReviewChapterFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface ReviewChapter {
  index: number;
  title: string;
  summary: string;
  files: ReviewChapterFile[];
  diffLines: ReviewDiffLine[];
  viewed: boolean;
}

export interface ChapterViewedResult {
  index: number;
  viewed: boolean;
  progress: { viewed: number; total: number };
}

export interface CreateReviewCommentInput {
  chapterIndex: number;
  path: string;
  side: "LEFT" | "RIGHT";
  line: number;
  body: string;
}

export interface CreatedReviewComment {
  id: string;
  githubCommentId: number;
  htmlUrl: string;
}

/** Toggle a chapter's viewed mark for the current user (browser-only call). */
export function setChapterViewed(
  org: string,
  repo: string,
  number: number,
  index: number,
  viewed: boolean,
): Promise<ChapterViewedResult> {
  return apiRequest<ChapterViewedResult>(
    `/api/v1/pulls/${org}/${repo}/${number}/chapters/${index}/viewed`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ viewed }),
    },
  );
}

/** Create a GitHub inline review comment for one diff line. */
export function createReviewComment(
  org: string,
  repo: string,
  number: number,
  input: CreateReviewCommentInput,
): Promise<CreatedReviewComment> {
  return apiRequest<CreatedReviewComment>(`/api/v1/pulls/${org}/${repo}/${number}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export type PullRequestStatus = "open" | "merged" | "closed" | "draft";

export interface ReviewPrMeta {
  org: string;
  repo: string;
  number: number;
  title: string;
  status: PullRequestStatus;
  author: string;
  htmlUrl: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
}

/** A PR commit, rendered as the construction-flow graph beside the chapters. */
export interface ReviewCommit {
  sha: string;
  message: string;
  author: string;
  authoredAt: string;
  parents: string[];
  branch: "base" | "head";
}

export interface ReviewPayload {
  pr: ReviewPrMeta;
  chapters: ReviewChapter[];
  /** Oldest→newest PR commits; may be empty if GitHub was unreachable. */
  commits: ReviewCommit[];
}

export interface FetchReviewOptions {
  /** Forwarded `Cookie` header so server-component fetches carry the session. */
  cookie?: string;
}

export function fetchReview(
  org: string,
  repo: string,
  number: number,
  opts?: FetchReviewOptions,
): Promise<ReviewPayload> {
  const path = `/api/v1/pulls/${org}/${repo}/${number}/review`;
  // Only attach init when forwarding a cookie so the browser path (where
  // credentials:"include" already sends cookies) stays a plain request.
  return opts?.cookie
    ? apiRequest<ReviewPayload>(path, { headers: { cookie: opts.cookie } })
    : apiRequest<ReviewPayload>(path);
}

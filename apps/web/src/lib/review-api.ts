import { apiRequest } from "./api-client";

export interface ReviewDiffLine {
  path: string;
  n: number;
  kind: "add" | "del" | "ctx";
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export type ReviewFileStatus = "added" | "modified" | "deleted" | "renamed" | "moved";

export interface ReviewChapterFile {
  path: string;
  status: ReviewFileStatus;
  additions: number;
  deletions: number;
  viewed: boolean;
}

export interface ReviewLineRef {
  filePath: string;
  side: "additions" | "deletions";
  startLine: number;
  endLine: number;
}

export interface ReviewKeyChange {
  id: string;
  content: string;
  lineRefs: ReviewLineRef[];
  viewed: boolean;
}

export interface ReviewChapter {
  index: number;
  title: string;
  summary: string;
  files: ReviewChapterFile[];
  diffLines: ReviewDiffLine[];
  keyChanges: ReviewKeyChange[];
  viewed: boolean;
}

export interface ChapterViewedResult {
  index: number;
  viewed: boolean;
  progress: { viewed: number; total: number };
}

export interface FileViewedResult {
  path: string;
  viewed: boolean;
  progress: { viewed: number; total: number };
}

export interface KeyChangeViewedResult {
  id: string;
  viewed: boolean;
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

/** Toggle a file's viewed mark for the current user. */
export function setFileViewed(
  org: string,
  repo: string,
  number: number,
  path: string,
  viewed: boolean,
): Promise<FileViewedResult> {
  return apiRequest<FileViewedResult>(`/api/v1/pulls/${org}/${repo}/${number}/files/viewed`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, viewed }),
  });
}

/** Toggle one generated review question's viewed mark for the current user. */
export function setKeyChangeViewed(
  org: string,
  repo: string,
  number: number,
  chapterIndex: number,
  keyChangeId: string,
  viewed: boolean,
): Promise<KeyChangeViewedResult> {
  return apiRequest<KeyChangeViewedResult>(
    `/api/v1/pulls/${org}/${repo}/${number}/chapters/${chapterIndex}/key-changes/${keyChangeId}/viewed`,
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
  body: string;
  status: PullRequestStatus;
  author: string;
  htmlUrl: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
}

export interface ReviewIssueComment {
  id: number;
  body: string;
  author: string;
  avatarUrl: string;
  createdAt: string;
  htmlUrl: string;
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
  comments: ReviewIssueComment[];
  /** Oldest→newest PR commits; may be empty if GitHub was unreachable. */
  commits: ReviewCommit[];
  /** True when only the initial commit window was loaded. */
  commitsTruncated: boolean;
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

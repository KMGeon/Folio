/** Web-facing diff line: line number, change kind, text (mirrors apps/web DiffLine). */
export interface WebDiffLine {
  n: number;
  kind: "add" | "del" | "ctx";
  text: string;
}

export interface WebChapterFile {
  path: string;
  additions: number;
  deletions: number;
}

/** A chapter's sliced code: which files it touches + its diff lines. */
export interface ChapterCode {
  files: WebChapterFile[];
  diffLines: WebDiffLine[];
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

export interface ReviewChapter {
  index: number;
  title: string;
  summary: string;
  files: WebChapterFile[];
  diffLines: WebDiffLine[];
  /** Whether the current user has marked this chapter viewed. */
  viewed: boolean;
}

/** A PR commit, used to render the construction-flow graph beside the chapters. */
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
  /** PR conversation comments from GitHub; empty when GitHub is unreachable. */
  comments: ReviewIssueComment[];
  /** Oldest→newest PR commits; empty when GitHub is unreachable at read time. */
  commits: ReviewCommit[];
}

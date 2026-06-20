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
}

export interface ReviewPrMeta {
  org: string;
  repo: string;
  number: number;
  title: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
}

export interface ReviewPayload {
  pr: ReviewPrMeta;
  chapters: ReviewChapter[];
}

export function fetchReview(org: string, repo: string, number: number): Promise<ReviewPayload> {
  return apiRequest<ReviewPayload>(`/api/v1/pulls/${org}/${repo}/${number}/review`);
}

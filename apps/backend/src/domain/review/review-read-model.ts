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

export interface ReviewPrMeta {
  org: string;
  repo: string;
  number: number;
  title: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
}

export interface ReviewChapter {
  index: number;
  title: string;
  summary: string;
  files: WebChapterFile[];
  diffLines: WebDiffLine[];
}

export interface ReviewPayload {
  pr: ReviewPrMeta;
  chapters: ReviewChapter[];
}

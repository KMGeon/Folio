import type { ChapterCode, WebDiffLine } from "./review-read-model.js";

export interface CommentTarget {
  path: string;
  side: "LEFT" | "RIGHT";
  line: number;
}

export function isCommentTargetInChapter(code: ChapterCode, target: CommentTarget): boolean {
  return code.diffLines.some((line) => isMatchingLine(line, target));
}

function isMatchingLine(line: WebDiffLine, target: CommentTarget): boolean {
  if (line.path !== target.path) {
    return false;
  }
  if (target.side === "LEFT") {
    return line.kind === "del" && line.oldLineNumber === target.line;
  }
  return line.kind !== "del" && line.newLineNumber === target.line;
}

import type { CreateReviewCommentInput, ReviewDiffLine } from "@/lib/review-api";

export function commentTargetForLine(
  line: ReviewDiffLine,
): Pick<CreateReviewCommentInput, "path" | "side" | "line"> {
  if (line.kind === "del") {
    return { path: line.path, side: "LEFT", line: line.oldLineNumber ?? line.n };
  }

  return { path: line.path, side: "RIGHT", line: line.newLineNumber ?? line.n };
}

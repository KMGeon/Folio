import type { ReactNode } from "react";

import type { ReviewDiffLine } from "@/lib/review-api";
import { cn } from "@/lib/utils";

import { CommentButton } from "./diff-comment-controls";

export function SplitLineCells({
  line,
  side,
  canComment,
  created,
  isActive,
  renderLine,
  onSelect,
}: {
  line: ReviewDiffLine | null;
  side: "old" | "new";
  canComment: boolean;
  created: boolean;
  isActive: boolean;
  renderLine: (line: ReviewDiffLine) => ReactNode;
  onSelect: (line: ReviewDiffLine) => void;
}) {
  if (!line) {
    return (
      <>
        <td className="w-12 select-none border-r border-border/60 px-2 text-right align-top text-gutter tabular-nums" />
        <td className="w-5 select-none px-1 text-center align-top" />
        <td className="w-8 select-none px-1 align-top" />
        <td className="w-1/2 border-r border-border/60 py-px pr-4 align-top" />
      </>
    );
  }

  const isOldDeletion = side === "old" && line.kind === "del";
  const isNewAddition = side === "new" && line.kind === "add";
  const lineNumber =
    side === "old" ? (line.oldLineNumber ?? line.n) : (line.newLineNumber ?? line.n);

  return (
    <>
      <td
        className={cn(
          "w-12 select-none border-r border-border/60 px-2 text-right align-top text-gutter tabular-nums",
          isActive && "bg-primary/15",
        )}
      >
        {lineNumber}
      </td>
      <td
        className={cn(
          "w-5 select-none px-1 text-center align-top",
          isNewAddition && "text-diff-add-fg",
          isOldDeletion && "text-diff-del-fg",
          !isNewAddition && !isOldDeletion && "text-transparent",
        )}
      >
        {isNewAddition ? "+" : isOldDeletion ? "-" : " "}
      </td>
      <td className="w-8 select-none px-1 align-top">
        <CommentButton
          canComment={canComment}
          created={created}
          isActive={isActive}
          line={line}
          onClick={() => onSelect(line)}
        />
      </td>
      <td
        className={cn(
          "w-1/2 whitespace-pre-wrap break-words border-border/60 py-px pr-4 align-top text-foreground/90",
          side === "old" && "border-r",
          isNewAddition && "bg-diff-add-bg",
          isOldDeletion && "bg-diff-del-bg",
          isActive && "bg-primary/15",
        )}
      >
        {renderLine(line)}
      </td>
    </>
  );
}

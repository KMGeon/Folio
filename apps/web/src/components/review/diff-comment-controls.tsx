import { Bold, Check, Italic, Link2, Loader2, MessageSquarePlus, X } from "lucide-react";

import type { CreatedReviewComment, ReviewDiffLine } from "@/lib/review-api";
import { cn } from "@/lib/utils";

export function CommentButton({
  canComment,
  created,
  isActive,
  line,
  onClick,
}: {
  canComment: boolean;
  created: boolean;
  isActive: boolean;
  line: ReviewDiffLine;
  onClick: () => void;
}) {
  if (!canComment) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mt-px flex size-5 items-center justify-center rounded border bg-background text-muted-foreground opacity-0 transition-opacity hover:border-primary hover:text-primary group-hover:opacity-100",
        (isActive || created) && "opacity-100",
      )}
      aria-label={`${line.n}번 라인에 댓글 작성`}
    >
      <MessageSquarePlus className="size-3.5" />
    </button>
  );
}

export function CreatedCommentLink({ comment }: { comment: CreatedReviewComment }) {
  return (
    <a
      href={comment.htmlUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-primary text-xs hover:bg-primary/15"
    >
      <Check className="size-3.5" />
      GitHub에 댓글이 작성되었습니다.
    </a>
  );
}

export function InlineCommentEditor({
  value,
  onChange,
  submitting,
  error,
  onCancel,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-primary/55 bg-card shadow-lg shadow-background/30">
      <div className="flex items-center justify-between border-b bg-muted/35 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-background px-2 py-1 font-medium text-xs">Write</span>
          <span className="px-2 py-1 text-muted-foreground text-xs">Preview</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Bold className="size-3.5" />
          <Italic className="size-3.5" />
          <Link2 className="size-3.5" />
        </div>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Leave a comment"
        className="min-h-28 w-full resize-y bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      {error ? <div className="px-4 pb-2 text-destructive text-xs">{error}</div> : null}
      <div className="flex items-center gap-3 border-t px-4 py-3">
        <label className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className="flex size-5 items-center justify-center rounded border border-primary/40 bg-primary text-primary-foreground">
            <Check className="size-3.5" />
          </span>
          Start a review
        </label>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-medium text-sm hover:bg-accent"
        >
          <X className="size-4" />
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !value.trim()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MessageSquarePlus className="size-4" />
          )}
          Comment
        </button>
      </div>
    </div>
  );
}

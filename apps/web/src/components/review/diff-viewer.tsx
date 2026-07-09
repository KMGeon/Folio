import {
  Bold,
  Check,
  ChevronDown,
  Circle,
  FileText,
  Italic,
  Link2,
  Loader2,
  MessageSquarePlus,
  X,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { langFromPath } from "@/lib/code-language";
import { highlightMarkdownLine } from "@/lib/highlight";
import {
  createReviewComment,
  type CreatedReviewComment,
  type ReviewChapter,
  type ReviewDiffLine,
} from "@/lib/review-api";
import { type TokenizedLines, tokenizeDiffLines } from "@/lib/syntax-highlight";
import { cn } from "@/lib/utils";

import { commentTargetForLine } from "./diff-comment-target";

// overallSummary, focusAreas, risks, and REVIEW_COMMENT are not in ReviewPayload;
// those sub-sections are omitted to avoid re-introducing the sample import.

const SIGN: Record<string, string> = { add: "+", del: "-", ctx: " " };

interface CommentContext {
  org: string;
  repo: string;
  number: number;
  chapterIndex: number;
  path?: string;
}

interface ActiveLine {
  key: string;
  line: ReviewDiffLine;
}

export function DiffViewer({
  chapter,
  compact = false,
  commentContext,
}: {
  chapter: ReviewChapter;
  compact?: boolean;
  commentContext?: CommentContext;
}) {
  const [activeLine, setActiveLine] = useState<ActiveLine | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, CreatedReviewComment>>({});

  const diffFile = commentContext?.path ?? chapter.files[0]?.path ?? "unknown";
  const additions = chapter.files.reduce((sum, file) => sum + file.additions, 0);
  const canComment = Boolean(commentContext && diffFile !== "unknown");

  // Syntax highlighting: diff lines carry no language, so derive it from the
  // file path and tokenize the whole chapter as one block (keeps multi-line
  // strings/comments correct). Null lang → fall back to the markdown highlighter.
  const lang = langFromPath(diffFile);
  const [tokens, setTokens] = useState<TokenizedLines | null>(null);

  useEffect(() => {
    if (!lang) {
      setTokens(null);
      return;
    }
    let cancelled = false;
    setTokens(null);
    void tokenizeDiffLines(
      chapter.diffLines.map((line) => line.text),
      lang,
    ).then((result) => {
      if (!cancelled) {
        setTokens(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lang, chapter.diffLines]);

  function renderLine(line: ReviewDiffLine, index: number) {
    const row = tokens?.[index];
    if (!row) {
      // Prose/unknown files keep markdown highlighting; code shows plain text
      // until Shiki tokens arrive.
      return lang ? line.text : highlightMarkdownLine(line.text, `l${index}`);
    }
    return row.map((token, t) => (
      <span key={`${index}-${t}`} style={token.color ? { color: token.color } : undefined}>
        {token.content}
      </span>
    ));
  }

  async function submitComment() {
    const text = body.trim();
    if (!commentContext || !activeLine || !text) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const target = commentTargetForLine(activeLine.line);
      const result = await createReviewComment(
        commentContext.org,
        commentContext.repo,
        commentContext.number,
        {
          chapterIndex: commentContext.chapterIndex,
          ...target,
          body: text,
        },
      );
      setCreated((prev) => ({ ...prev, [activeLine.key]: result }));
      setActiveLine(null);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글을 작성하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={cn("min-w-0 flex-1 overflow-y-auto", compact ? "p-0" : "p-4")}>
      {compact ? null : (
        <section className="mb-4 rounded-lg border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">챕터 개요</div>
          <h2 className="mt-2 text-lg font-semibold">{chapter.title}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{chapter.summary}</p>
        </section>
      )}

      <div className={cn("overflow-hidden bg-card", compact ? "" : "rounded-lg border")}>
        <div className="flex items-center gap-2 border-b px-3 py-2.5 text-sm">
          <ChevronDown className="size-4 text-muted-foreground" />
          <FileText className="size-4 text-primary" />
          <span className="min-w-0 truncate font-mono text-[13px]">{diffFile}</span>
          <span className="ml-2 font-mono text-xs text-diff-add-fg">+{additions}</span>
          <Circle className="ml-auto size-4 text-muted-foreground" />
        </div>

        <div className="overflow-x-auto font-mono text-xs leading-4">
          <table className="w-full border-collapse">
            <tbody>
              {chapter.diffLines.map((line, i) => {
                const key = `${line.kind}-${line.n}-${i}`;
                const isActive = activeLine?.key === key;
                const createdComment = created[key];
                return (
                  <Fragment key={key}>
                    <tr
                      key={key}
                      className={cn(
                        "group",
                        line.kind === "add" && "bg-diff-add-bg",
                        line.kind === "del" && "bg-diff-del-bg",
                        isActive && "bg-primary/15",
                      )}
                    >
                      <td className="w-12 select-none border-r border-border/60 px-2 text-right align-top text-gutter tabular-nums">
                        {line.n}
                      </td>
                      <td
                        className={cn(
                          "w-5 select-none px-1 text-center align-top",
                          line.kind === "add" && "text-diff-add-fg",
                          line.kind === "del" && "text-diff-del-fg",
                          line.kind === "ctx" && "text-transparent",
                        )}
                      >
                        {SIGN[line.kind]}
                      </td>
                      <td className="w-8 select-none px-1 align-top">
                        {canComment ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveLine({ key, line });
                              setBody("");
                              setError(null);
                            }}
                            className={cn(
                              "mt-px flex size-5 items-center justify-center rounded border bg-background text-muted-foreground opacity-0 transition-opacity hover:border-primary hover:text-primary group-hover:opacity-100",
                              (isActive || createdComment) && "opacity-100",
                            )}
                            aria-label={`${line.n}번 라인에 댓글 작성`}
                          >
                            <MessageSquarePlus className="size-3.5" />
                          </button>
                        ) : null}
                      </td>
                      <td className="whitespace-pre-wrap break-words py-px pr-4 align-top text-foreground/90">
                        {renderLine(line, i)}
                      </td>
                    </tr>
                    {isActive ? (
                      <tr key={`${key}-comment`} className="bg-primary/15">
                        <td className="border-r border-border/60" />
                        <td />
                        <td />
                        <td className="py-3 pr-4">
                          <InlineCommentEditor
                            value={body}
                            onChange={setBody}
                            submitting={submitting}
                            error={error}
                            onCancel={() => {
                              setActiveLine(null);
                              setBody("");
                              setError(null);
                            }}
                            onSubmit={submitComment}
                          />
                        </td>
                      </tr>
                    ) : null}
                    {createdComment ? (
                      <tr key={`${key}-created`} className="bg-primary/10">
                        <td className="border-r border-border/60" />
                        <td />
                        <td />
                        <td className="py-2 pr-4">
                          <a
                            href={createdComment.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-primary text-xs hover:bg-primary/15"
                          >
                            <Check className="size-3.5" />
                            GitHub에 댓글이 작성되었습니다.
                          </a>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InlineCommentEditor({
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

import { ChevronDown, Circle, FileText } from "lucide-react";
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
import { CommentButton, CreatedCommentLink, InlineCommentEditor } from "./diff-comment-controls";
import { SplitLineCells } from "./split-diff-line-cells";
import { buildSplitDiffRows } from "./split-diff-rows";

// overallSummary, focusAreas, risks, and REVIEW_COMMENT are not in ReviewPayload;
// those sub-sections are omitted to avoid re-introducing the sample import.

const SIGN: Record<string, string> = { add: "+", del: "-", ctx: " " };
type DiffViewMode = "unified" | "split";

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
  const [viewMode, setViewMode] = useState<DiffViewMode>("unified");

  const diffFile = commentContext?.path ?? chapter.files[0]?.path ?? "unknown";
  const additions = chapter.files.reduce((sum, file) => sum + file.additions, 0);
  const canComment = Boolean(commentContext && diffFile !== "unknown");
  const lineIndexes = new Map(chapter.diffLines.map((line, index) => [line, index]));
  const splitRows = buildSplitDiffRows(chapter.diffLines);

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

  function keyForLine(line: ReviewDiffLine) {
    const index = lineIndexes.get(line) ?? 0;
    return `${line.kind}-${line.n}-${index}`;
  }

  function indexForLine(line: ReviewDiffLine) {
    return lineIndexes.get(line) ?? 0;
  }

  function selectLine(key: string, line: ReviewDiffLine) {
    setActiveLine({ key, line });
    setBody("");
    setError(null);
  }

  function changeViewMode(mode: DiffViewMode) {
    setViewMode(mode);
    setActiveLine(null);
    setBody("");
    setError(null);
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
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-md border bg-background p-0.5 text-xs">
              {(["unified", "split"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeViewMode(mode)}
                  className={cn(
                    "h-6 rounded px-2 font-medium transition-colors",
                    viewMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  aria-pressed={viewMode === mode}
                >
                  {mode === "unified" ? "Unified" : "Split"}
                </button>
              ))}
            </div>
            <Circle className="size-4 text-muted-foreground" />
          </div>
        </div>

        <div className="overflow-x-auto font-mono text-xs leading-4">
          {viewMode === "unified" ? (
            <table className="w-full border-collapse">
              <tbody>
                {chapter.diffLines.map((line) => {
                  const key = keyForLine(line);
                  const isActive = activeLine?.key === key;
                  const createdComment = created[key];
                  return (
                    <Fragment key={key}>
                      <tr
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
                          <CommentButton
                            canComment={canComment}
                            created={Boolean(createdComment)}
                            isActive={isActive}
                            line={line}
                            onClick={() => selectLine(key, line)}
                          />
                        </td>
                        <td className="whitespace-pre-wrap break-words py-px pr-4 align-top text-foreground/90">
                          {renderLine(line, indexForLine(line))}
                        </td>
                      </tr>
                      {isActive ? (
                        <tr className="bg-primary/15">
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
                        <tr className="bg-primary/10">
                          <td className="border-r border-border/60" />
                          <td />
                          <td />
                          <td className="py-2 pr-4">
                            <CreatedCommentLink comment={createdComment} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="min-w-[960px] w-full border-collapse">
              <tbody>
                {splitRows.map((row, rowIndex) => {
                  const oldKey = row.oldLine ? keyForLine(row.oldLine) : null;
                  const newKey = row.newLine ? keyForLine(row.newLine) : null;
                  const activeKey =
                    (oldKey && activeLine?.key === oldKey) || (newKey && activeLine?.key === newKey)
                      ? activeLine.key
                      : null;
                  const createdComment =
                    (oldKey ? created[oldKey] : null) ?? (newKey ? created[newKey] : null);
                  return (
                    <Fragment key={`${oldKey ?? "blank"}-${newKey ?? "blank"}-${rowIndex}`}>
                      <tr className={cn("group", activeKey && "bg-primary/15")}>
                        <SplitLineCells
                          line={row.oldLine}
                          side="old"
                          canComment={canComment}
                          created={Boolean(oldKey && created[oldKey])}
                          isActive={Boolean(oldKey && activeLine?.key === oldKey)}
                          renderLine={(line) => renderLine(line, indexForLine(line))}
                          onSelect={(line) => selectLine(keyForLine(line), line)}
                        />
                        <SplitLineCells
                          line={row.newLine}
                          side="new"
                          canComment={canComment}
                          created={Boolean(newKey && created[newKey])}
                          isActive={Boolean(newKey && activeLine?.key === newKey)}
                          renderLine={(line) => renderLine(line, indexForLine(line))}
                          onSelect={(line) => selectLine(keyForLine(line), line)}
                        />
                      </tr>
                      {activeKey ? (
                        <tr className="bg-primary/15">
                          <td className="border-r border-border/60" />
                          <td />
                          <td />
                          <td colSpan={5} className="py-3 pr-4">
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
                        <tr className="bg-primary/10">
                          <td className="border-r border-border/60" />
                          <td />
                          <td />
                          <td colSpan={5} className="py-2 pr-4">
                            <CreatedCommentLink comment={createdComment} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

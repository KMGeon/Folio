import { useEffect, useState } from "react";

import { langFromPath } from "@/lib/code-language";
import { highlightMarkdownLine } from "@/lib/highlight";
import {
  createReviewComment,
  type CreatedReviewComment,
  type ReviewChapter,
  type ReviewDiffLine,
} from "@/lib/review-api";
import { type TokenizedLines, tokenizeDiffLines } from "@/lib/syntax-highlight";
import { commentTargetForLine } from "./diff-comment-target";
import type { DiffViewMode } from "./diff-view-mode-switch";
import { type ActiveDiffLine, FileDiffPanel } from "./review-file-diff-panel";
import { groupLinesByFile } from "./review-file-state";
import { EMPTY_FOCUS_MARKERS } from "./focus-line-styles";
import { diffLineElementId, type FocusLineMarker, type JumpTarget } from "./resolve-line-ref";

interface CommentContext {
  org: string;
  repo: string;
  number: number;
  chapterIndex: number;
  path?: string;
}

export function DiffViewer({
  chapter,
  compact = false,
  commentContext,
  collapsedFiles,
  focusMarkers = EMPTY_FOCUS_MARKERS,
  jumpTarget = null,
  viewMode,
  onFileViewedChange,
  onFileCollapseChange,
}: {
  chapter: ReviewChapter;
  compact?: boolean;
  commentContext?: CommentContext;
  collapsedFiles: Record<string, boolean>;
  focusMarkers?: FocusLineMarker[];
  jumpTarget?: JumpTarget | null;
  viewMode: DiffViewMode;
  onFileViewedChange?: (path: string, viewed: boolean) => Promise<void>;
  onFileCollapseChange: (path: string, collapsed: boolean) => void;
}) {
  const [activeLine, setActiveLine] = useState<ActiveDiffLine | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, CreatedReviewComment>>({});

  const canComment = Boolean(commentContext);
  const fileGroups = groupLinesByFile(chapter);
  const lineIndexes = new Map(chapter.diffLines.map((line, index) => [line, index]));
  const lang = langFromPath(commentContext?.path ?? chapter.files[0]?.path ?? "");
  const [tokens, setTokens] = useState<TokenizedLines | null>(null);

  useEffect(() => {
    setActiveLine(null);
    setBody("");
    setError(null);
  }, [viewMode]);

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

  // Parent owns clearing jumpTarget; scroll to the range anchor when the token changes.
  useEffect(() => {
    if (!jumpTarget || jumpTarget.chapterIndex !== chapter.index) {
      return;
    }
    const line = chapter.diffLines.find(
      (entry) =>
        entry.path === jumpTarget.anchor.path &&
        entry.kind === jumpTarget.anchor.kind &&
        entry.n === jumpTarget.anchor.lineNumber,
    );
    if (!line) {
      return;
    }
    const id = diffLineElementId(chapter.index, line);
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [jumpTarget, chapter]);

  function renderLine(line: ReviewDiffLine, index: number) {
    const row = tokens?.[index];
    if (!row) {
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
    return `${line.path}-${line.kind}-${line.n}-${index}`;
  }

  function indexForLine(line: ReviewDiffLine) {
    return lineIndexes.get(line) ?? 0;
  }

  function selectLine(key: string, line: ReviewDiffLine) {
    setActiveLine({ key, line });
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
        { chapterIndex: commentContext.chapterIndex, ...target, body: text },
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
    <div
      className={
        compact ? "min-w-0 flex-1 overflow-y-auto p-0" : "min-w-0 flex-1 overflow-y-auto p-3"
      }
    >
      <div className="space-y-3">
        {fileGroups.map(({ file, lines }) => (
          <FileDiffPanel
            key={file.path}
            activeLine={activeLine}
            canComment={canComment}
            chapterIndex={chapter.index}
            collapsed={Boolean(collapsedFiles[file.path])}
            created={created}
            error={error}
            file={file}
            focusMarkers={focusMarkers}
            jumpTarget={jumpTarget}
            lines={lines}
            viewMode={viewMode}
            body={body}
            submitting={submitting}
            onBodyChange={setBody}
            onCancelComment={() => {
              setActiveLine(null);
              setBody("");
              setError(null);
            }}
            onCommentSubmit={submitComment}
            onFileViewedChange={onFileViewedChange}
            onToggleCollapse={() => onFileCollapseChange(file.path, !collapsedFiles[file.path])}
            keyForLine={keyForLine}
            renderLine={(line) => renderLine(line, indexForLine(line))}
            selectLine={selectLine}
          />
        ))}
      </div>
    </div>
  );
}

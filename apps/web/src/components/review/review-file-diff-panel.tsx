import { Check, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { type ReactNode, Fragment } from "react";

import type {
  CreatedReviewComment,
  ReviewChapter,
  ReviewDiffLine,
  ReviewFileStatus,
} from "@/lib/review-api";
import { cn } from "@/lib/utils";

import { CommentButton, CommentRows } from "./diff-comment-controls";
import type { DiffViewMode } from "./diff-view-mode-switch";
import { filePanelId } from "./review-file-state";
import { EMPTY_FOCUS_MARKERS, focusRowClass, isJumpLine } from "./focus-line-styles";
import {
  diffLineElementId,
  isFocusMarkerLine,
  type FocusLineMarker,
  type JumpTarget,
} from "./resolve-line-ref";
import { SplitLineCells } from "./split-diff-line-cells";
import { buildSplitDiffRows } from "./split-diff-rows";

const SIGN: Record<string, string> = { add: "+", del: "-", ctx: " " };

// Green only for additions — keep file chrome semantic, not decorative primary.
function fileIconClass(status: ReviewFileStatus): string {
  switch (status) {
    case "added":
      return "text-diff-add-fg";
    case "deleted":
      return "text-diff-del-fg";
    case "renamed":
    case "moved":
      return "text-syntax-link";
    default:
      return "text-muted-foreground";
  }
}

export interface ActiveDiffLine {
  key: string;
  line: ReviewDiffLine;
}

export function FileDiffPanel({
  activeLine,
  body,
  canComment,
  chapterIndex,
  collapsed,
  created,
  error,
  file,
  focusMarkers = EMPTY_FOCUS_MARKERS,
  jumpTarget,
  lines,
  submitting,
  viewMode,
  onBodyChange,
  onCancelComment,
  onCommentSubmit,
  onFileViewedChange,
  onToggleCollapse,
  keyForLine,
  renderLine,
  selectLine,
}: {
  activeLine: ActiveDiffLine | null;
  body: string;
  canComment: boolean;
  chapterIndex: number;
  collapsed: boolean;
  created: Record<string, CreatedReviewComment>;
  error: string | null;
  file: ReviewChapter["files"][number];
  focusMarkers?: FocusLineMarker[];
  jumpTarget?: JumpTarget | null;
  lines: ReviewDiffLine[];
  submitting: boolean;
  viewMode: DiffViewMode;
  onBodyChange: (body: string) => void;
  onCancelComment: () => void;
  onCommentSubmit: () => void;
  onFileViewedChange?: (path: string, viewed: boolean) => Promise<void>;
  onToggleCollapse: () => void;
  keyForLine: (line: ReviewDiffLine) => string;
  renderLine: (line: ReviewDiffLine) => ReactNode;
  selectLine: (key: string, line: ReviewDiffLine) => void;
}) {
  return (
    <section
      id={filePanelId(chapterIndex, file.path)}
      className="overflow-hidden rounded-lg border bg-card"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2.5 text-sm">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={collapsed ? `${file.path} 파일 펼치기` : `${file.path} 파일 접기`}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <FileText className={cn("size-4", fileIconClass(file.status))} />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={file.path}>
          {file.path}
        </span>
        <span className="ml-2 font-mono text-xs text-diff-add-fg">+{file.additions}</span>
        {file.deletions > 0 ? (
          <span className="font-mono text-diff-del-fg text-xs">-{file.deletions}</span>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            await onFileViewedChange?.(file.path, !file.viewed);
          }}
          // File coverage is secondary to chapter completion — keep this check muted, not primary green fill.
          className={cn(
            "flex size-4 items-center justify-center rounded-full border transition-colors",
            file.viewed
              ? "border-muted-foreground/50 bg-muted/50 text-muted-foreground"
              : "border-muted-foreground/40 text-muted-foreground/70 hover:border-muted-foreground hover:text-foreground",
          )}
          aria-pressed={file.viewed}
          aria-label={file.viewed ? `${file.path} 파일 읽음 해제` : `${file.path} 파일 읽음`}
        >
          {file.viewed ? <Check className="size-3" /> : null}
        </button>
      </div>
      {collapsed ? null : (
        <div className="overflow-x-auto font-mono text-xs leading-4">
          {viewMode === "unified" ? (
            <UnifiedDiffTable
              activeLine={activeLine}
              body={body}
              canComment={canComment}
              chapterIndex={chapterIndex}
              created={created}
              error={error}
              focusMarkers={focusMarkers}
              jumpTarget={jumpTarget}
              lines={lines}
              submitting={submitting}
              onBodyChange={onBodyChange}
              onCancelComment={onCancelComment}
              onCommentSubmit={onCommentSubmit}
              keyForLine={keyForLine}
              renderLine={renderLine}
              selectLine={selectLine}
            />
          ) : (
            <SplitDiffTable
              activeLine={activeLine}
              body={body}
              canComment={canComment}
              chapterIndex={chapterIndex}
              created={created}
              error={error}
              focusMarkers={focusMarkers}
              jumpTarget={jumpTarget}
              lines={lines}
              submitting={submitting}
              onBodyChange={onBodyChange}
              onCancelComment={onCancelComment}
              onCommentSubmit={onCommentSubmit}
              keyForLine={keyForLine}
              renderLine={renderLine}
              selectLine={selectLine}
            />
          )}
        </div>
      )}
    </section>
  );
}

function UnifiedDiffTable({
  activeLine,
  body,
  canComment,
  chapterIndex,
  created,
  error,
  focusMarkers = EMPTY_FOCUS_MARKERS,
  jumpTarget,
  lines,
  submitting,
  onBodyChange,
  onCancelComment,
  onCommentSubmit,
  keyForLine,
  renderLine,
  selectLine,
}: DiffTableProps) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {lines.map((line) => {
          const key = keyForLine(line);
          const isActive = activeLine?.key === key;
          const isJump = isJumpLine(jumpTarget, line, chapterIndex);
          const isFocus = Boolean(isFocusMarkerLine(focusMarkers, line));
          const createdComment = created[key];
          return (
            <Fragment key={key}>
              <tr
                id={diffLineElementId(chapterIndex, line)}
                className={cn(
                  "group",
                  line.kind === "add" && !isJump && !isFocus && "bg-diff-add-bg",
                  line.kind === "del" && !isJump && !isFocus && "bg-diff-del-bg",
                  focusRowClass(isFocus, isJump, isActive),
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
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    {isFocus || isJump ? (
                      <span
                        className={cn(
                          "inline-flex size-2 rounded-full",
                          isJump ? "bg-primary shadow-[0_0_0_3px] shadow-primary/30" : "bg-warning",
                        )}
                        title="검토할 사항에 연결된 줄"
                        aria-hidden
                      />
                    ) : null}
                    <CommentButton
                      canComment={canComment}
                      created={Boolean(createdComment)}
                      isActive={isActive}
                      line={line}
                      onClick={() => selectLine(key, line)}
                    />
                  </div>
                </td>
                <td className="whitespace-pre-wrap break-words py-px pr-4 align-top text-foreground/90">
                  {renderLine(line)}
                </td>
              </tr>
              <CommentRows
                active={isActive}
                body={body}
                colSpan={1}
                comment={createdComment}
                error={error}
                submitting={submitting}
                onBodyChange={onBodyChange}
                onCancel={onCancelComment}
                onSubmit={onCommentSubmit}
              />
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function SplitDiffTable(props: DiffTableProps) {
  return (
    <table className="min-w-[960px] w-full border-collapse">
      <tbody>
        {buildSplitDiffRows(props.lines).map((row, rowIndex) => {
          const oldKey = row.oldLine ? props.keyForLine(row.oldLine) : null;
          const newKey = row.newLine ? props.keyForLine(row.newLine) : null;
          const activeKey =
            (oldKey && props.activeLine?.key === oldKey) ||
            (newKey && props.activeLine?.key === newKey)
              ? props.activeLine.key
              : null;
          const createdComment =
            (oldKey ? props.created[oldKey] : null) ?? (newKey ? props.created[newKey] : null);
          const comment = createdComment ?? undefined;
          const oldIsJump =
            row.oldLine != null && isJumpLine(props.jumpTarget, row.oldLine, props.chapterIndex);
          const newIsJump =
            row.newLine != null && isJumpLine(props.jumpTarget, row.newLine, props.chapterIndex);
          const isJump = oldIsJump || newIsJump;
          const isFocus =
            (row.oldLine != null &&
              Boolean(isFocusMarkerLine(props.focusMarkers ?? [], row.oldLine))) ||
            (row.newLine != null &&
              Boolean(isFocusMarkerLine(props.focusMarkers ?? [], row.newLine)));
          // Prefer the matching jump line for the stable DOM id so scrollIntoView finds it.
          const anchorLine =
            row.oldLine && oldIsJump
              ? row.oldLine
              : row.newLine && newIsJump
                ? row.newLine
                : (row.newLine ?? row.oldLine);
          return (
            <Fragment key={`${oldKey ?? "blank"}-${newKey ?? "blank"}-${rowIndex}`}>
              <tr
                id={anchorLine ? diffLineElementId(props.chapterIndex, anchorLine) : undefined}
                className={cn("group", focusRowClass(isFocus, isJump, Boolean(activeKey)))}
              >
                <SplitLineCells
                  line={row.oldLine}
                  side="old"
                  canComment={props.canComment}
                  created={Boolean(oldKey && props.created[oldKey])}
                  isActive={Boolean(oldKey && props.activeLine?.key === oldKey)}
                  renderLine={props.renderLine}
                  onSelect={(line) => props.selectLine(props.keyForLine(line), line)}
                />
                <SplitLineCells
                  line={row.newLine}
                  side="new"
                  canComment={props.canComment}
                  created={Boolean(newKey && props.created[newKey])}
                  isActive={Boolean(newKey && props.activeLine?.key === newKey)}
                  renderLine={props.renderLine}
                  onSelect={(line) => props.selectLine(props.keyForLine(line), line)}
                />
              </tr>
              <CommentRows
                active={Boolean(activeKey)}
                body={props.body}
                colSpan={5}
                comment={comment}
                error={props.error}
                submitting={props.submitting}
                onBodyChange={props.onBodyChange}
                onCancel={props.onCancelComment}
                onSubmit={props.onCommentSubmit}
              />
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

interface DiffTableProps {
  activeLine: ActiveDiffLine | null;
  body: string;
  canComment: boolean;
  chapterIndex: number;
  created: Record<string, CreatedReviewComment>;
  error: string | null;
  focusMarkers?: FocusLineMarker[];
  jumpTarget?: JumpTarget | null;
  lines: ReviewDiffLine[];
  submitting: boolean;
  onBodyChange: (body: string) => void;
  onCancelComment: () => void;
  onCommentSubmit: () => void;
  keyForLine: (line: ReviewDiffLine) => string;
  renderLine: (line: ReviewDiffLine) => ReactNode;
  selectLine: (key: string, line: ReviewDiffLine) => void;
}

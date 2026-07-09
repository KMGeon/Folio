import { Check, ChevronDown, ChevronRight, FileText, MessageSquarePlus } from "lucide-react";
import { type ReactNode, Fragment } from "react";

import type { CreatedReviewComment, ReviewChapter, ReviewDiffLine } from "@/lib/review-api";
import { cn } from "@/lib/utils";

import { CommentButton, CreatedCommentLink, InlineCommentEditor } from "./diff-comment-controls";
import { filePanelId } from "./review-file-state";
import { SplitLineCells } from "./split-diff-line-cells";
import { buildSplitDiffRows } from "./split-diff-rows";

const SIGN: Record<string, string> = { add: "+", del: "-", ctx: " " };
export type DiffViewMode = "unified" | "split";

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
  lines,
  submitting,
  viewMode,
  onBodyChange,
  onCancelComment,
  onCommentSubmit,
  onFileViewedChange,
  onToggleCollapse,
  onViewModeChange,
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
  lines: ReviewDiffLine[];
  submitting: boolean;
  viewMode: DiffViewMode;
  onBodyChange: (body: string) => void;
  onCancelComment: () => void;
  onCommentSubmit: () => void;
  onFileViewedChange?: (path: string, viewed: boolean) => Promise<void>;
  onToggleCollapse: () => void;
  onViewModeChange: (mode: DiffViewMode) => void;
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
        <FileText className="size-4 text-primary" />
        <span className="min-w-0 truncate font-mono text-[13px]">{file.path}</span>
        <span className="ml-2 font-mono text-xs text-diff-add-fg">+{file.additions}</span>
        {file.deletions > 0 ? (
          <span className="font-mono text-diff-del-fg text-xs">-{file.deletions}</span>
        ) : null}
        <ViewModeSwitch value={viewMode} onChange={onViewModeChange} />
        <button
          type="button"
          onClick={async () => {
            await onFileViewedChange?.(file.path, !file.viewed);
          }}
          className={cn(
            "flex size-5 items-center justify-center rounded-full border transition-colors",
            file.viewed
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/60 text-muted-foreground hover:border-primary hover:text-primary",
          )}
          aria-pressed={file.viewed}
          aria-label={file.viewed ? `${file.path} 파일 읽음 해제` : `${file.path} 파일 읽음`}
        >
          {file.viewed ? <Check className="size-3.5" /> : null}
        </button>
        <MessageSquarePlus className="size-4 text-muted-foreground" />
      </div>
      {collapsed ? null : (
        <div className="overflow-x-auto font-mono text-xs leading-4">
          {viewMode === "unified" ? (
            <UnifiedDiffTable
              activeLine={activeLine}
              body={body}
              canComment={canComment}
              created={created}
              error={error}
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
              created={created}
              error={error}
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

function ViewModeSwitch({
  value,
  onChange,
}: {
  value: DiffViewMode;
  onChange: (mode: DiffViewMode) => void;
}) {
  return (
    <div className="ml-auto flex rounded-md border bg-background p-0.5 text-xs">
      {(["unified", "split"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            "h-6 rounded px-2 font-medium transition-colors",
            value === mode
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          aria-pressed={value === mode}
        >
          {mode === "unified" ? "Unified" : "Split"}
        </button>
      ))}
    </div>
  );
}

function UnifiedDiffTable({
  activeLine,
  body,
  canComment,
  created,
  error,
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
          return (
            <Fragment key={`${oldKey ?? "blank"}-${newKey ?? "blank"}-${rowIndex}`}>
              <tr className={cn("group", activeKey && "bg-primary/15")}>
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
  created: Record<string, CreatedReviewComment>;
  error: string | null;
  lines: ReviewDiffLine[];
  submitting: boolean;
  onBodyChange: (body: string) => void;
  onCancelComment: () => void;
  onCommentSubmit: () => void;
  keyForLine: (line: ReviewDiffLine) => string;
  renderLine: (line: ReviewDiffLine) => ReactNode;
  selectLine: (key: string, line: ReviewDiffLine) => void;
}

function CommentRows({
  active,
  body,
  colSpan,
  comment,
  error,
  submitting,
  onBodyChange,
  onCancel,
  onSubmit,
}: {
  active: boolean;
  body: string;
  colSpan: number;
  comment?: CreatedReviewComment;
  error: string | null;
  submitting: boolean;
  onBodyChange: (body: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      {active ? (
        <tr className="bg-primary/15">
          <td className="border-r border-border/60" />
          <td />
          <td />
          <td colSpan={colSpan} className="py-3 pr-4">
            <InlineCommentEditor
              value={body}
              onChange={onBodyChange}
              submitting={submitting}
              error={error}
              onCancel={onCancel}
              onSubmit={onSubmit}
            />
          </td>
        </tr>
      ) : null}
      {comment ? (
        <tr className="bg-primary/10">
          <td className="border-r border-border/60" />
          <td />
          <td />
          <td colSpan={colSpan} className="py-2 pr-4">
            <CreatedCommentLink comment={comment} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

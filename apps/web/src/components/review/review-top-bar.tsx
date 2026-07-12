import { BookOpen, FileText, GitMerge, GitPullRequest, Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PullRequestStatus, ReviewPrMeta } from "@/lib/review-api";
import { cn } from "@/lib/utils";

export type ReviewTab = "chapters" | "files";

const STATUS_META: Record<
  PullRequestStatus,
  { label: string; className: string; icon: typeof GitPullRequest }
> = {
  open: {
    label: "열려 있는",
    className: "border-primary/30 bg-primary/10 text-primary",
    icon: GitPullRequest,
  },
  merged: {
    label: "병합됨",
    className: "border-syntax-emphasis/30 bg-syntax-emphasis/10 text-syntax-emphasis",
    icon: GitMerge,
  },
  closed: {
    label: "닫힘",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: GitPullRequest,
  },
  draft: {
    label: "초안",
    className: "border-warning/30 bg-warning/15 text-warning",
    icon: GitPullRequest,
  },
};

export function ReviewTopBar({
  pr,
  activeTab,
  onTabChange,
  chapterCount,
  fileCount,
  viewedChapters,
  totalChapters,
  viewedFiles,
  totalFiles,
  totalAdditions,
  totalDeletions,
}: {
  pr: ReviewPrMeta;
  activeTab: ReviewTab;
  onTabChange: (tab: ReviewTab) => void;
  chapterCount: number;
  fileCount: number;
  /** Chapter milestone progress — primary product signal. */
  viewedChapters: number;
  totalChapters: number;
  viewedFiles: number;
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
}) {
  const status = STATUS_META[pr.status];
  const StatusIcon = status.icon;

  return (
    <div className="shrink-0 px-4 pt-2.5 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-medium text-xs",
                status.className,
              )}
            >
              <StatusIcon className="size-3.5" />
              {status.label}
            </span>
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
              풀 리퀘스트
            </span>
          </div>
          <h1 className="min-w-0 font-sans text-xl font-medium leading-snug tracking-tight">
            {pr.title}
            <span className="ml-1.5 font-mono text-sm text-muted-foreground">#{pr.number}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5">
              <GitMerge className="size-3.5 shrink-0" />
              <code className="rounded border border-info/30 bg-info/15 px-1.5 py-px font-mono text-info text-[11px]">
                {pr.headBranch}
              </code>
              <span className="text-muted-foreground/60">→</span>
              <code className="rounded border border-primary/30 bg-primary/15 px-1.5 py-px font-mono text-primary text-[11px]">
                {pr.baseBranch}
              </code>
            </span>
            <span className="font-mono text-[11px]">{pr.headSha.slice(0, 12)}</span>
            <span className="flex items-center gap-1.5">
              <img
                src={`https://github.com/${pr.author}.png?size=40`}
                alt={pr.author}
                width={16}
                height={16}
                referrerPolicy="no-referrer"
                className="size-4 rounded-full border"
              />
              <span className="text-foreground/80">{pr.author}</span>
            </span>
          </div>
        </div>
        <Button
          asChild
          size="icon"
          variant="outline"
          className="size-8 shrink-0"
          aria-label="GitHub에서 보기"
        >
          <a href={pr.htmlUrl} target="_blank" rel="noreferrer">
            <Github className="size-4" />
          </a>
        </Button>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-b">
        <nav className="flex items-center gap-1 overflow-x-auto">
          <TabButton
            active={activeTab === "chapters"}
            onClick={() => onTabChange("chapters")}
            icon={BookOpen}
            label="챕터"
            count={chapterCount}
          />
          <TabButton
            active={activeTab === "files"}
            onClick={() => onTabChange("files")}
            icon={FileText}
            label="파일"
            count={fileCount}
          />
        </nav>
        <span className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums">
          <span className="font-medium text-foreground" title="완료한 챕터 / 전체 챕터">
            챕터 {viewedChapters}/{totalChapters}
          </span>
          <span className="text-border" aria-hidden>
            ·
          </span>
          <span className="text-muted-foreground" title="읽은 파일 / 전체 파일">
            파일 {viewedFiles}/{totalFiles}
          </span>
          <span className="text-diff-add-fg">+{totalAdditions}</span>
          <span className="text-diff-del-fg">-{totalDeletions}</span>
        </span>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof BookOpen;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-1.5 text-xs transition-colors",
        active
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-px text-[11px] tabular-nums",
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

export function PanelTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2.5 py-1 font-medium text-xs transition-colors",
        active ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

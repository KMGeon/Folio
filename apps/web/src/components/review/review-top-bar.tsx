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
    className: "border-border bg-secondary text-muted-foreground",
    icon: GitPullRequest,
  },
};

export function ReviewTopBar({
  pr,
  activeTab,
  onTabChange,
  chapterCount,
  fileCount,
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
  viewedFiles: number;
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
}) {
  const status = STATUS_META[pr.status];
  const StatusIcon = status.icon;

  return (
    <div className="shrink-0 px-4 pt-3 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium text-xs",
                status.className,
              )}
            >
              <StatusIcon className="size-3.5" />
              {status.label}
            </span>
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
              Pull Request
            </span>
          </div>
          <h1 className="min-w-0 font-sans text-2xl font-medium leading-tight tracking-tight">
            {pr.title}
            <span className="ml-2 font-mono text-sm text-muted-foreground">#{pr.number}</span>
          </h1>
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

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5">
          <GitMerge className="size-3.5" />
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground text-xs">
            {pr.headBranch}
          </code>
          <span className="text-muted-foreground/60">→</span>
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground text-xs">
            {pr.baseBranch}
          </code>
        </span>
        <span className="font-mono text-xs">{pr.headSha.slice(0, 12)}</span>
        <span className="flex items-center gap-1.5">
          <img
            src={`https://github.com/${pr.author}.png?size=40`}
            alt={pr.author}
            width={20}
            height={20}
            referrerPolicy="no-referrer"
            className="size-5 rounded-full border"
          />
          <span className="text-foreground/80">{pr.author}</span>
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-b">
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
            label="파일이 변경됨"
            count={fileCount}
          />
        </nav>
        <span className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums">
          <span className="text-muted-foreground">
            {viewedFiles}/{totalFiles} viewed
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
        "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2 text-xs transition-colors",
        active
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
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

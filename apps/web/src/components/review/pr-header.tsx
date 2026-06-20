import {
  BookOpen,
  Check,
  FileText,
  GitMerge,
  GitPullRequest,
  Github,
  MessageSquare,
  PanelLeftClose,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReviewPayload } from "@/lib/review-api";
import { cn } from "@/lib/utils";

// Chapter count and changed-files total come from the payload; approvals/author are not in ReviewPayload.
type Tab = { key: string; label: string; icon: typeof BookOpen; count?: number };

function makeTabs(chapterCount: number): Tab[] {
  return [
    { key: "chapters", label: "챕터", icon: BookOpen, count: chapterCount },
    { key: "activity", label: "활동", icon: MessageSquare },
    { key: "files", label: "파일이 변경되었습니다", icon: FileText },
  ];
}

export function PrHeader({ pr, chapterCount }: { pr: ReviewPayload["pr"]; chapterCount: number }) {
  const TABS = makeTabs(chapterCount);

  return (
    <div className="shrink-0 px-4 pt-5 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            <GitPullRequest className="size-3.5" />
            열려 있는
          </span>
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight md:text-2xl">
            {pr.title}
            <span className="ml-2 font-normal text-muted-foreground">#{pr.number}</span>
          </h1>
        </div>
        <Button
          size="icon"
          variant="outline"
          className="size-8 shrink-0"
          aria-label="GitHub에서 보기"
        >
          <Github className="size-4" />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <GitMerge className="size-3.5" />
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {pr.headBranch}
          </code>
          <span className="text-muted-foreground/60">→</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {pr.baseBranch}
          </code>
        </span>

        <span className="font-mono text-xs">{pr.headSha}</span>

        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
          <Check className="size-3.5" />
          병합 준비 완료
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-b">
        <nav className="flex items-center gap-1 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon, count }, i) => {
            const active = i === 0;
            return (
              <button
                type="button"
                key={key}
                className={cn(
                  "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
                {count !== undefined && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[11px] tabular-nums",
                      active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-0.5 pb-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground"
            aria-label="패널 접기"
          >
            <PanelLeftClose className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground"
            aria-label="보기 설정"
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

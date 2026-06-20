import {
  BookOpen,
  Check,
  CheckCircle2,
  FileText,
  GitMerge,
  GitPullRequest,
  Github,
  MessageSquare,
  PanelLeftClose,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PR } from "@/lib/sample-review";
import { cn } from "@/lib/utils";

function Avatar({ seed, className }: { seed: string; className?: string }) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + hash * 31;
  }
  const hue = Math.abs(hash) % 360;
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ring-background",
        className,
      )}
      style={{ backgroundColor: `oklch(0.6 0.13 ${hue})` }}
    >
      {seed.slice(0, 1).toUpperCase()}
    </span>
  );
}

type Tab = { key: string; label: string; icon: typeof BookOpen; count?: number };

const TABS: Tab[] = [
  { key: "chapters", label: "챕터", icon: BookOpen, count: PR.chapters.length },
  { key: "activity", label: "활동", icon: MessageSquare },
  { key: "files", label: "파일이 변경되었습니다", icon: FileText, count: PR.changedFiles },
];

export function PrHeader() {
  return (
    <div className="shrink-0 px-4 pt-5 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            <GitPullRequest className="size-3.5" />
            열려 있는
          </span>
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight md:text-2xl">
            {PR.title}
            <span className="ml-2 font-normal text-muted-foreground">#{PR.number}</span>
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
          <Avatar seed={PR.author} />
          <span className="font-medium text-foreground">{PR.author}</span>은 {PR.openedAgo}
        </span>

        <span className="flex items-center gap-1.5">
          <GitMerge className="size-3.5" />
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {PR.headBranch}
          </code>
          <span className="text-muted-foreground/60">→</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {PR.baseBranch}
          </code>
        </span>

        <span className="font-mono text-xs">{PR.headSha}</span>

        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
          <Check className="size-3.5" />
          병합 준비 완료
        </span>

        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5 text-primary" />
          <span className="text-foreground">
            {PR.approvals.done}/{PR.approvals.total}
          </span>{" "}
          확인
          <span className="flex -space-x-1.5 pl-0.5">
            <Avatar seed="reviewer-a" />
            <Avatar seed="reviewer-b" />
          </span>
        </span>

        <span className="ml-auto flex items-center gap-1.5">
          <Users className="size-3.5" />
          <span className="flex -space-x-1.5">
            <Avatar seed="participant" />
          </span>
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

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FileText,
  Folder,
  MoreHorizontal,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PR, getActiveChapter } from "@/lib/sample-review";
import { cn } from "@/lib/utils";

const RISK_LABEL: Record<string, string> = {
  low: "낮은 위험",
  medium: "중간 위험",
  high: "높은 위험",
};

const RISK_STYLES: Record<string, string> = {
  low: "border-primary/30 text-primary",
  medium: "border-syntax-code/40 text-syntax-code",
  high: "border-destructive/40 text-destructive",
};

export function ChapterPanel() {
  const chapter = getActiveChapter();
  const additions = chapter.files.reduce((sum, file) => sum + file.additions, 0);

  return (
    <aside className="flex w-full shrink-0 flex-col border-b lg:h-auto lg:w-[380px] lg:overflow-y-auto lg:border-r lg:border-b-0">
      <div className="flex items-center gap-1 px-4 pt-4">
        <Circle className="size-4 text-muted-foreground" />
        <button
          type="button"
          className="ml-1 flex items-center gap-1 rounded px-1.5 py-1 text-sm font-medium hover:bg-accent"
        >
          제 {chapter.index} 장
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto size-7 text-muted-foreground"
          aria-label="다음 장"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-muted-foreground"
          aria-label="장 메뉴"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </div>

      <div className="px-4 pt-3">
        <h2 className="text-lg font-semibold tracking-tight">{chapter.title}</h2>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
              RISK_STYLES[chapter.risk],
            )}
          >
            {RISK_LABEL[chapter.risk]}
          </span>
          <span className="font-mono text-xs text-primary">+ {additions}</span>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{chapter.summary}</p>
      </div>

      <div className="mt-5 border-t px-4 py-4">
        <h3 className="text-xs font-medium text-muted-foreground">리뷰 포인트</h3>
        <ul className="mt-3 space-y-2 text-sm leading-6">
          {chapter.reviewHints.map((hint) => (
            <li key={hint} className="flex gap-2 text-muted-foreground">
              <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-primary" />
              <span>{hint}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t px-4 py-4">
        <h3 className="text-xs font-medium text-muted-foreground">
          파일 ( {chapter.files.length} )
        </h3>

        <div className="relative mt-3">
          <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="파일 필터링..."
            className="h-8 w-full rounded-md border bg-transparent pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
        </div>

        <div className="mt-3 flex flex-col gap-0.5 text-sm">
          <div className="flex items-center gap-1.5 rounded px-1.5 py-1 text-muted-foreground">
            <Folder className="size-3.5" />
            <span>changed files</span>
          </div>
          {chapter.files.map((file) => (
            <button
              type="button"
              key={file.path}
              className="ml-3 flex items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-accent"
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.path}</span>
              <span className="shrink-0 font-mono text-xs text-primary">+{file.additions}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t px-4 py-4">
        <h3 className="text-xs font-medium text-muted-foreground">전체 챕터</h3>
        <div className="mt-3 space-y-1">
          {PR.chapters.map((item) => (
            <button
              type="button"
              key={item.index}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                item.index === chapter.index && "bg-accent text-foreground",
              )}
            >
              <span className="w-5 shrink-0 text-xs text-muted-foreground">{item.index}</span>
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              {item.viewed && <CheckCircle2 className="size-3.5 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

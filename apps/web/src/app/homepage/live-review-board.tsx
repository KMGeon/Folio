import { Github } from "lucide-react";

import { cn } from "@/lib/utils";

import { chapterRows, codeLines, pipelineColumns } from "./homepage-data";
import styles from "./homepage.module.css";

export function LiveReviewBoard() {
  return (
    <div className="relative hidden lg:block" aria-label="PR이 챕터로 정렬되는 과정">
      <div
        aria-hidden
        className={cn("absolute inset-8 rounded-full bg-primary/10 blur-3xl", styles.glowPulse)}
      />
      <div
        className={cn("relative rounded-lg border bg-card/80 p-3 backdrop-blur", styles.liveBoard)}
      >
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <p className="font-mono text-muted-foreground text-xs">KMGeon/Folio #1284</p>
            <h2 className="mt-1 font-semibold text-sm">GitHub OAuth와 리뷰 저장 흐름 정리</h2>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary text-xs">
            <span className={cn("size-1.5 rounded-full bg-primary", styles.statusPulse)} />
            decomposing
          </div>
        </div>

        <PipelineCards />
        <div className="mt-3 grid grid-cols-[1fr_0.78fr] gap-3">
          <ChapterCards />
          <CodePreview />
        </div>
      </div>
    </div>
  );
}

function PipelineCards() {
  return (
    <div className="relative mt-3 grid grid-cols-3 gap-2">
      <span
        aria-hidden
        className={cn("absolute left-[18%] top-1/2 h-px w-[64%] bg-border", styles.pipelineLine)}
      />
      {pipelineColumns.map((column, index) => (
        <div
          key={column.label}
          className={cn("relative rounded-md border bg-background/55 p-3", styles.pipelineCard)}
          style={{ animationDelay: `${index * 180}ms` }}
        >
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md border bg-card text-primary">
              <column.icon className="size-3.5" />
            </div>
            <span className="font-medium text-xs">{column.label}</span>
          </div>
          <p className="mt-2 font-mono text-muted-foreground text-[11px]">{column.detail}</p>
        </div>
      ))}
    </div>
  );
}

function ChapterCards() {
  return (
    <div className="space-y-2">
      {chapterRows.map((row, index) => (
        <div
          key={row.chapter}
          className={cn(
            "grid grid-cols-[2.3rem_minmax(0,1fr)_4.8rem] items-center gap-3 rounded-md border bg-background/55 px-3 py-3",
            row.status === "review" && "border-primary/30 bg-primary/5",
            styles.chapterCard,
          )}
          style={{ animationDelay: `${index * 130}ms` }}
        >
          <span className="font-mono text-muted-foreground text-xs">{row.chapter}</span>
          <div className="min-w-0">
            <div className="truncate font-medium text-sm">{row.title}</div>
            <div className="truncate font-mono text-muted-foreground text-xs">{row.files}</div>
          </div>
          <div className="text-right font-mono text-xs">
            <span className="text-diff-add-fg">+{row.add}</span>{" "}
            <span className="text-diff-del-fg">-{row.del}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CodePreview() {
  return (
    <div className="overflow-hidden rounded-md border bg-background/55">
      <div className="flex h-9 items-center gap-1.5 border-b px-3">
        <span className="size-2 rounded-full bg-destructive/80" />
        <span className="size-2 rounded-full bg-syntax-code/80" />
        <span className="size-2 rounded-full bg-primary/80" />
        <span className="ml-auto font-mono text-muted-foreground text-[11px]">chapter-02.ts</span>
      </div>
      <div className="space-y-2 p-3 font-mono text-[11px] leading-5">
        {codeLines.map((line, index) => (
          <div
            key={line}
            className={cn(
              "truncate rounded-sm px-2",
              line.startsWith("+")
                ? "bg-diff-add-bg text-diff-add-fg"
                : "bg-diff-del-bg text-diff-del-fg",
              styles.codeLine,
            )}
            style={{ animationDelay: `${index * 160}ms` }}
          >
            {line}
          </div>
        ))}
      </div>
      <div className="border-t px-3 py-2">
        <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
          <span>review focus</span>
          <span className="flex items-center gap-1 text-primary">
            <Github className="size-3" />
            OAuth state leak
          </span>
        </div>
      </div>
    </div>
  );
}

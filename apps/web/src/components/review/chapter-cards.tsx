import { ArrowRight, CheckCircle2, FileText } from "lucide-react";
import Link from "next/link";

import type { ReviewChapter } from "@/lib/review-api";
import { cn } from "@/lib/utils";

/**
 * The chapter breakdown as review-entry cards. With `onSelect` the card is a
 * button (in-place drill-in); otherwise it links to `{prPath}/chapters/{index}`.
 */
export function ChapterCards({
  chapters,
  prPath,
  onSelect,
}: {
  chapters: ReviewChapter[];
  prPath?: string;
  onSelect?: (index: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {chapters.map((chapter) => {
        const additions = chapter.files.reduce((sum, file) => sum + file.additions, 0);
        const deletions = chapter.files.reduce((sum, file) => sum + file.deletions, 0);
        const risk = chapterRisk(chapter);
        const inner = (
          <>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-muted-foreground text-xs">
              {chapter.viewed ? <CheckCircle2 className="size-3.5 text-primary" /> : chapter.index}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-base group-hover:text-primary">
                {chapter.title}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2.5 font-mono text-sm tabular-nums">
                <RiskPill risk={risk} />
                <span className="text-diff-add-fg">+{additions}</span>
                {deletions > 0 ? <span className="text-diff-del-fg">-{deletions}</span> : null}
                <span className="flex items-center gap-1 text-muted-foreground">
                  <FileText className="size-3" />
                  {chapter.files.length}
                </span>
                {chapter.keyChanges.length > 0 ? (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <CheckCircle2 className="size-3" />
                    {chapter.keyChanges.filter((item) => item.viewed).length}/
                    {chapter.keyChanges.length}
                  </span>
                ) : null}
              </div>
            </div>
            {chapter.index === 1 ? (
              <span className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm">
                Start reviewing
                <ArrowRight className="size-4" />
              </span>
            ) : (
              <ArrowRight className="mt-2 size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            )}
          </>
        );
        const className = cn(
          "group flex w-full items-center gap-4 border-b p-5 text-left transition-colors last:border-b-0 hover:bg-accent/55",
        );
        return onSelect ? (
          <button
            key={chapter.index}
            type="button"
            onClick={() => onSelect(chapter.index)}
            className={className}
          >
            {inner}
          </button>
        ) : (
          <Link
            key={chapter.index}
            href={`${prPath}/chapters/${chapter.index}`}
            className={className}
          >
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

type ChapterRisk = "low" | "medium" | "high";

function chapterRisk(chapter: ReviewChapter): ChapterRisk {
  const additions = chapter.files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = chapter.files.reduce((sum, file) => sum + file.deletions, 0);
  const changed = additions + deletions;
  if (deletions > 25 || changed > 350 || chapter.files.length > 8) {
    return "high";
  }
  if (deletions > 0 || changed > 80 || chapter.files.length > 2) {
    return "medium";
  }
  return "low";
}

function RiskPill({ risk }: { risk: ChapterRisk }) {
  const meta = {
    low: "bg-primary/15 text-primary",
    medium: "bg-warning/15 text-warning",
    high: "bg-destructive/15 text-destructive",
  } satisfies Record<ChapterRisk, string>;
  const label = {
    low: "Low risk",
    medium: "Medium risk",
    high: "High risk",
  } satisfies Record<ChapterRisk, string>;

  return (
    <span className={cn("rounded-full px-2 py-0.5 font-medium text-xs", meta[risk])}>
      {label[risk]}
    </span>
  );
}

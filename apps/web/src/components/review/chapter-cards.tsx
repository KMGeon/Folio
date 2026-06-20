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
    <div className="flex flex-col gap-2">
      {chapters.map((chapter) => {
        const additions = chapter.files.reduce((sum, file) => sum + file.additions, 0);
        const deletions = chapter.files.reduce((sum, file) => sum + file.deletions, 0);
        const inner = (
          <>
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-muted-foreground text-xs">
              {chapter.viewed ? <CheckCircle2 className="size-3.5 text-primary" /> : chapter.index}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm group-hover:text-primary">
                {chapter.title}
              </div>
              <div className="mt-1.5 flex items-center gap-2.5 font-mono text-xs tabular-nums">
                <span className="text-diff-add-fg">+{additions}</span>
                {deletions > 0 ? <span className="text-diff-del-fg">-{deletions}</span> : null}
                <span className="flex items-center gap-1 text-muted-foreground">
                  <FileText className="size-3" />
                  {chapter.files.length}
                </span>
              </div>
            </div>
            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </>
        );
        const className = cn(
          "group flex items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40",
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

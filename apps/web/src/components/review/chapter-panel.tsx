import { CheckCircle2, ChevronRight, Folder, Search } from "lucide-react";
import Link from "next/link";

import { FileStatusMarker } from "@/components/review/changed-file-tree";
import { ChapterSwitcher } from "@/components/review/chapter-switcher";
import { ChapterViewedToggle } from "@/components/review/chapter-viewed-toggle";
import { Button } from "@/components/ui/button";
import type { ReviewChapter } from "@/lib/review-api";
import { cn } from "@/lib/utils";

// risk/reviewHints are not in ReviewPayload; those sub-sections are omitted.

export function ChapterPanel({
  chapters,
  activeIndex,
  prPath,
  org,
  repo,
  number,
}: {
  chapters: ReviewChapter[];
  activeIndex: number;
  /** e.g. "/KMGeon/Folio/pull/38" — chapter links append "/chapters/{index}". */
  prPath: string;
  org: string;
  repo: string;
  number: number;
}) {
  const chapter = chapters.find((c) => c.index === activeIndex) ?? chapters[0];
  if (!chapter) {
    return null;
  }

  const additions = chapter.files.reduce((sum, file) => sum + file.additions, 0);
  const nextChapter = chapters.find((c) => c.index > chapter.index);

  return (
    <aside className="flex w-full shrink-0 flex-col border-b lg:h-auto lg:w-[380px] lg:overflow-y-auto lg:border-r lg:border-b-0">
      <div className="flex items-center gap-1 px-4 pt-4">
        <ChapterViewedToggle
          org={org}
          repo={repo}
          number={number}
          index={chapter.index}
          initialViewed={chapter.viewed}
        />
        <ChapterSwitcher chapters={chapters} activeIndex={chapter.index} prPath={prPath} />
        <Button
          asChild={Boolean(nextChapter)}
          size="icon"
          variant="ghost"
          className="ml-auto size-7 text-muted-foreground"
          aria-label="다음 장"
          disabled={!nextChapter}
        >
          {nextChapter ? (
            <Link href={`${prPath}/chapters/${nextChapter.index}`}>
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <ChevronRight className="size-4" />
          )}
        </Button>
      </div>

      <div className="px-4 pt-3">
        <h2 className="text-lg font-semibold tracking-tight">{chapter.title}</h2>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-xs text-diff-add-fg">+ {additions}</span>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{chapter.summary}</p>
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
              <FileStatusMarker status={file.status} />
              <span className="min-w-0 flex-1 truncate">{file.path}</span>
              <span className="shrink-0 font-mono text-xs text-diff-add-fg">+{file.additions}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t px-4 py-4">
        <h3 className="text-xs font-medium text-muted-foreground">전체 챕터</h3>
        <div className="mt-3 space-y-1">
          {chapters.map((item) => (
            <Link
              key={item.index}
              href={`${prPath}/chapters/${item.index}`}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                item.index === chapter.index && "bg-accent text-foreground",
              )}
            >
              <span className="flex w-5 shrink-0 justify-center text-xs text-muted-foreground">
                {item.viewed ? <CheckCircle2 className="size-3.5 text-primary" /> : item.index}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}

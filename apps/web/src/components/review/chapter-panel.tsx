"use client";

import { Check, CheckCircle2, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FileTree } from "@/components/review/changed-file-tree";
import { ChapterSwitcher } from "@/components/review/chapter-switcher";
import { ChapterViewedToggle } from "@/components/review/chapter-viewed-toggle";
import { setKeyChangeViewed, type ReviewChapter } from "@/lib/review-api";
import { cn } from "@/lib/utils";

import { filePanelId } from "./review-file-state";

// risk/reviewHints are not in ReviewPayload; those sub-sections are omitted.

export function ChapterPanel({
  chapters,
  activeIndex,
  prPath,
  org,
  repo,
  number,
  onKeyChangeViewedChange,
}: {
  chapters: ReviewChapter[];
  activeIndex: number;
  /** e.g. "/KMGeon/Folio/pull/38" — chapter links append "/chapters/{index}". */
  prPath: string;
  org: string;
  repo: string;
  number: number;
  onKeyChangeViewedChange?: (chapterIndex: number, keyChangeId: string, viewed: boolean) => void;
}) {
  const chapter = chapters.find((c) => c.index === activeIndex) ?? chapters[0];
  const [keyChanges, setKeyChanges] = useState(chapter?.keyChanges ?? []);
  const [fileQuery, setFileQuery] = useState("");

  useEffect(() => {
    setKeyChanges(chapter?.keyChanges ?? []);
  }, [chapter]);

  if (!chapter) {
    return null;
  }

  const additions = chapter.files.reduce((sum, file) => sum + file.additions, 0);
  const chapterFiles = chapter.files.map((file) => ({
    ...file,
    chapterIndex: chapter.index,
    chapterTitle: chapter.title,
  }));

  return (
    <aside className="flex w-full shrink-0 flex-col border-b lg:h-auto lg:w-[460px] lg:overflow-y-auto lg:border-b-0 lg:border-l">
      <div className="flex items-center gap-1 px-3 pt-3">
        <ChapterViewedToggle
          org={org}
          repo={repo}
          number={number}
          index={chapter.index}
          initialViewed={chapter.viewed}
        />
        <ChapterSwitcher chapters={chapters} activeIndex={chapter.index} prPath={prPath} />
      </div>

      <div className="px-3 pt-2.5">
        <h2 className="font-sans text-lg font-medium leading-snug tracking-tight">
          {chapter.title}
        </h2>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-xs text-diff-add-fg">+ {additions}</span>
        </div>

        <p className="mt-3 text-sm leading-5 text-muted-foreground">{chapter.summary}</p>
      </div>

      <div className="border-t px-3 py-3">
        <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          검토할 사항
        </h3>
        <div className="mt-3 space-y-2">
          {keyChanges.length > 0 ? (
            keyChanges.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={async () => {
                  const next = !item.viewed;
                  setKeyChanges((prev) =>
                    prev.map((keyChange) =>
                      keyChange.id === item.id ? { ...keyChange, viewed: next } : keyChange,
                    ),
                  );
                  onKeyChangeViewedChange?.(chapter.index, item.id, next);
                  try {
                    await setKeyChangeViewed(org, repo, number, chapter.index, item.id, next);
                  } catch {
                    onKeyChangeViewedChange?.(chapter.index, item.id, !next);
                    setKeyChanges((prev) =>
                      prev.map((keyChange) =>
                        keyChange.id === item.id ? { ...keyChange, viewed: !next } : keyChange,
                      ),
                    );
                  }
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm leading-5 transition-colors",
                  item.viewed
                    ? "border-primary/25 bg-primary/10 text-muted-foreground line-through"
                    : "border-border bg-background/35 hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                    item.viewed && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {item.viewed ? <Check className="size-3" /> : null}
                </span>
                <span>{item.content}</span>
              </button>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">검토할 사항이 없습니다.</p>
          )}
        </div>
      </div>

      <div className="border-t px-3 py-3">
        <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          파일 · {chapter.files.length}
        </h3>

        <div className="relative mt-3">
          <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="파일 필터링..."
            value={fileQuery}
            onChange={(event) => setFileQuery(event.target.value)}
            className="h-7 w-full rounded-md border bg-transparent pr-2 pl-8 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
        </div>

        <FileTree
          files={chapterFiles}
          query={fileQuery}
          selectedPath=""
          onSelect={(path) =>
            document
              .getElementById(filePanelId(chapter.index, path))
              ?.scrollIntoView({ block: "start", behavior: "smooth" })
          }
        />
      </div>

      <div className="border-t px-3 py-3">
        <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          전체 챕터
        </h3>
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

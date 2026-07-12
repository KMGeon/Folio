"use client";

import { Check, CheckCircle2, ListChecks, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FileTree } from "@/components/review/changed-file-tree";
import { ChapterSwitcher } from "@/components/review/chapter-switcher";
import { ChapterViewedToggle } from "@/components/review/chapter-viewed-toggle";
import { chapterLocalProgress } from "@/components/review/review-progress";
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
  showReviewFocus = true,
  onKeyChangeViewedChange,
  onChapterViewedChange,
  onJumpToKeyChange,
  jumpNotice,
}: {
  chapters: ReviewChapter[];
  activeIndex: number;
  /** e.g. "/KMGeon/Folio/pull/38" — chapter links append "/chapters/{index}". */
  prPath: string;
  org: string;
  repo: string;
  number: number;
  showReviewFocus?: boolean;
  onKeyChangeViewedChange?: (chapterIndex: number, keyChangeId: string, viewed: boolean) => void;
  onChapterViewedChange?: (chapterIndex: number, viewed: boolean) => void;
  /** Request scroll/highlight for a key-change's lineRef (wired by parent). */
  onJumpToKeyChange?: (keyChangeId: string) => void;
  /** Shown under 검토할 사항 when a jump target cannot be resolved. */
  jumpNotice?: string | null;
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
  const deletions = chapter.files.reduce((sum, file) => sum + file.deletions, 0);
  // Live focus counts follow local keyChanges; file coverage follows chapter.files.
  const localProgress = chapterLocalProgress({ ...chapter, keyChanges });
  const chapterFiles = chapter.files.map((file) => ({
    ...file,
    chapterIndex: chapter.index,
    chapterTitle: chapter.title,
  }));

  return (
    // 380px keeps the chapter panel dense so the diff remains the main stage.
    <aside className="flex w-full shrink-0 flex-col border-b lg:h-auto lg:w-[380px] lg:overflow-y-auto lg:border-b-0 lg:border-l">
      <div className="flex items-center gap-1.5 px-3 pt-3">
        <ChapterViewedToggle
          org={org}
          repo={repo}
          number={number}
          index={chapter.index}
          initialViewed={chapter.viewed}
          focusComplete={localProgress.focusComplete}
          onViewedChange={onChapterViewedChange}
        />
        <ChapterSwitcher chapters={chapters} activeIndex={chapter.index} prPath={prPath} />
      </div>

      <div className="px-3 pt-2">
        {/* Title lives in the chapter tool strip — avoid a third copy of the same heading. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tabular-nums">
          {localProgress.focusTotal > 0 ? (
            <span
              className={cn(localProgress.focusComplete ? "text-primary" : "text-muted-foreground")}
              title="판단한 검토 사항 / 전체"
            >
              검토 {localProgress.focusDone}/{localProgress.focusTotal}
            </span>
          ) : null}
          {localProgress.focusTotal > 0 ? (
            <span className="text-border" aria-hidden>
              ·
            </span>
          ) : null}
          <span className="text-muted-foreground" title="읽은 파일 / 이 챕터 파일">
            파일 {localProgress.filesDone}/{localProgress.filesTotal}
          </span>
          <span className="text-border" aria-hidden>
            ·
          </span>
          <span className="text-diff-add-fg">+{additions}</span>
          {deletions > 0 ? <span className="text-diff-del-fg">-{deletions}</span> : null}
        </div>

        {/* Approach A: summary is primary reading surface — use foreground, not muted. */}
        <p className="mt-2.5 text-sm leading-6 text-foreground">{chapter.summary}</p>
      </div>

      {showReviewFocus ? (
        <div className="border-t px-3 py-3">
          <h3 className="flex items-center gap-1.5 font-semibold text-primary text-xs">
            <ListChecks className="size-3.5 shrink-0 text-primary" aria-hidden />
            검토할 사항
            {localProgress.focusTotal > 0 ? (
              <span className="font-mono font-normal text-muted-foreground tabular-nums">
                {localProgress.focusDone}/{localProgress.focusTotal}
              </span>
            ) : null}
          </h3>
          {jumpNotice ? (
            <p className="mt-2 rounded-md border border-border bg-card px-2.5 py-2 text-muted-foreground text-xs">
              {jumpNotice}
            </p>
          ) : null}
          <div className="mt-3 space-y-2">
            {keyChanges.length > 0 ? (
              keyChanges.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm leading-5",
                    item.viewed
                      ? "border-primary/25 bg-primary/10 text-muted-foreground"
                      : "border-border bg-card text-foreground",
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.viewed}
                    aria-label={item.viewed ? "검토 완료 해제" : "검토 완료로 표시"}
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
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                      item.viewed
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-foreground/30",
                    )}
                  >
                    {item.viewed ? <Check className="size-3" /> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => onJumpToKeyChange?.(item.id)}
                    className={cn(
                      "min-w-0 flex-1 text-left transition-colors hover:text-primary",
                      item.viewed && "line-through text-muted-foreground",
                    )}
                    aria-label="관련 diff로 이동"
                  >
                    {item.content}
                  </button>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">검토할 사항이 없습니다.</p>
            )}
          </div>
        </div>
      ) : null}

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

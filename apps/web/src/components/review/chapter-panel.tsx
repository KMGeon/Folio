"use client";

import { Check, CheckCircle2, ListChecks, Search } from "lucide-react";
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
  onSelectChapter,
  onJumpToKeyChange,
  activeKeyChangeId = null,
  jumpNotice,
}: {
  chapters: ReviewChapter[];
  activeIndex: number;
  /** e.g. "/KMGeon/Folio/pull/38" — used when in-place select is unavailable. */
  prPath: string;
  org: string;
  repo: string;
  number: number;
  showReviewFocus?: boolean;
  onKeyChangeViewedChange?: (chapterIndex: number, keyChangeId: string, viewed: boolean) => void;
  onChapterViewedChange?: (chapterIndex: number, viewed: boolean) => void;
  /** In-place chapter jump (preferred over hard navigation). */
  onSelectChapter?: (index: number) => void;
  /** Request scroll/highlight for a key-change's lineRef (wired by parent). */
  onJumpToKeyChange?: (keyChangeId: string) => void;
  /** Which focus question is currently linked in the diff. */
  activeKeyChangeId?: string | null;
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
    // Section padding stays a step looser than chrome controls so body copy breathes.
    <aside className="flex w-full shrink-0 flex-col border-b lg:h-auto lg:w-[380px] lg:overflow-y-auto lg:border-b-0 lg:border-l">
      <div className="flex items-center gap-2 px-4 pt-4">
        <ChapterViewedToggle
          org={org}
          repo={repo}
          number={number}
          index={chapter.index}
          initialViewed={chapter.viewed}
          focusComplete={localProgress.focusComplete}
          onViewedChange={onChapterViewedChange}
        />
        <ChapterSwitcher
          chapters={chapters}
          activeIndex={chapter.index}
          prPath={prPath}
          onSelect={onSelectChapter}
        />
      </div>

      <div className="px-4 pt-3 pb-4">
        {/* Title lives in the chapter tool strip — avoid a third copy of the same heading. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {localProgress.focusTotal > 0 ? (
            <span
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[11px] tabular-nums",
                localProgress.focusComplete
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-muted/40 text-muted-foreground",
              )}
              title="판단한 검토 사항 / 전체"
            >
              검토 {localProgress.focusDone}/{localProgress.focusTotal}
            </span>
          ) : null}
          <span
            className="rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] tabular-nums text-muted-foreground"
            title="읽은 파일 / 이 챕터 파일"
          >
            파일 {localProgress.filesDone}/{localProgress.filesTotal}
          </span>
          <span className="rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] tabular-nums">
            <span className="text-diff-add-fg">+{additions}</span>
            {deletions > 0 ? <span className="ml-1.5 text-diff-del-fg">-{deletions}</span> : null}
          </span>
        </div>

        {/* Approach A: summary is primary reading surface — use foreground, not muted. */}
        <p className="mt-3.5 text-sm leading-6 text-foreground">{chapter.summary}</p>
      </div>

      {showReviewFocus ? (
        <div className="border-t px-4 py-4">
          <h3 className="flex items-center gap-2 font-semibold text-primary text-xs">
            <ListChecks className="size-3.5 shrink-0 text-primary" aria-hidden />
            검토할 사항
            {localProgress.focusTotal > 0 ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono font-normal text-muted-foreground text-[11px] tabular-nums">
                {localProgress.focusDone}/{localProgress.focusTotal}
              </span>
            ) : null}
          </h3>
          {jumpNotice ? (
            <p className="mt-3 rounded-md border border-border bg-card px-3 py-2.5 text-muted-foreground text-xs leading-5">
              {jumpNotice}
            </p>
          ) : null}
          <div className="mt-3.5 space-y-2.5">
            {keyChanges.length > 0 ? (
              keyChanges.map((item) => {
                const isActive = activeKeyChangeId === item.id;
                const hasLink = item.lineRefs.length > 0;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "relative flex w-full items-start gap-3 rounded-md border px-3 py-3 text-sm leading-6",
                      // Amber family only — never primary green (reads as “added”) or info blue (reads as multi-line selection).
                      item.viewed &&
                        "border-border/80 bg-muted/25 text-muted-foreground opacity-80",
                      !item.viewed &&
                        !isActive &&
                        "border-warning/40 bg-warning/12 text-foreground shadow-[inset_3px_0_0_0] shadow-warning",
                      isActive &&
                        "border-warning/60 bg-warning/20 text-foreground shadow-[inset_3px_0_0_0] shadow-warning",
                    )}
                  >
                    {hasLink ? (
                      <span
                        className={cn(
                          "absolute top-3 right-3 size-2.5 rounded-full",
                          isActive
                            ? "bg-warning shadow-[0_0_0_3px] shadow-warning/40"
                            : "bg-warning shadow-[0_0_0_2px] shadow-warning/25",
                        )}
                        title="연결된 diff 줄이 있습니다"
                        aria-hidden
                      />
                    ) : null}
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
                        // Checking a question should also reveal its linked diff row.
                        onJumpToKeyChange?.(item.id);
                        try {
                          await setKeyChangeViewed(org, repo, number, chapter.index, item.id, next);
                        } catch {
                          onKeyChangeViewedChange?.(chapter.index, item.id, !next);
                          setKeyChanges((prev) =>
                            prev.map((keyChange) =>
                              keyChange.id === item.id
                                ? { ...keyChange, viewed: !next }
                                : keyChange,
                            ),
                          );
                        }
                      }}
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                        item.viewed
                          ? "border-primary bg-primary text-primary-foreground"
                          : isActive
                            ? "border-warning bg-warning/30 text-warning"
                            : "border-warning/70 bg-warning/20 text-warning",
                      )}
                    >
                      {item.viewed ? <Check className="size-3" /> : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => onJumpToKeyChange?.(item.id)}
                      className={cn(
                        "min-w-0 flex-1 pr-4 text-left transition-colors",
                        isActive && "text-warning hover:text-warning",
                        !isActive && !item.viewed && "hover:text-warning",
                        item.viewed && "line-through text-muted-foreground",
                      )}
                      aria-label="관련 diff로 이동"
                    >
                      {item.content}
                    </button>
                  </div>
                );
              })
            ) : (
              <p className="text-muted-foreground text-sm leading-6">검토할 사항이 없습니다.</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="border-t px-4 py-4">
        <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          파일 · {chapter.files.length}
        </h3>

        <div className="relative mt-3.5">
          <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="파일 필터링..."
            value={fileQuery}
            onChange={(event) => setFileQuery(event.target.value)}
            className="h-8 w-full rounded-md border bg-transparent pr-2 pl-8 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
        </div>

        <div className="mt-2">
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
      </div>

      <div className="border-t px-4 py-4">
        <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          전체 챕터
        </h3>
        <div className="mt-3.5 space-y-1.5">
          {chapters.map((item) => (
            <button
              key={item.index}
              type="button"
              onClick={() => onSelectChapter?.(item.index)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-sm hover:bg-accent",
                item.index === chapter.index && "bg-accent text-foreground",
              )}
            >
              <span className="flex w-5 shrink-0 justify-center text-xs text-muted-foreground">
                {item.viewed ? <CheckCircle2 className="size-3.5 text-primary" /> : item.index}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

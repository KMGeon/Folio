"use client";

import { ArrowRight, ChevronLeft, ChevronRight, ChevronsDown, ChevronsUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ChapterCards } from "@/components/review/chapter-cards";
import { getChapterNavigationShortcut } from "@/components/review/chapter-navigation-shortcut";
import {
  aggregateChangedFiles,
  resolveSelectedFilePath,
} from "@/components/review/changed-file-summary";
import { buildFileScopedChapter } from "@/components/review/chapter-file-diff";
import { ChapterPanel } from "@/components/review/chapter-panel";
import { CommitGraph } from "@/components/review/commit-graph";
import { DiffViewModeSwitch, type DiffViewMode } from "@/components/review/diff-view-mode-switch";
import { DiffViewer } from "@/components/review/diff-viewer";
import {
  areFilePathsCollapsed,
  fileProgress,
  setFilePathsCollapsed,
  viewedFileCollapseState,
} from "@/components/review/review-file-state";
import { ReviewFilesTab } from "@/components/review/review-files-tab";
import { chapterMilestoneProgress } from "@/components/review/review-progress";
import { ReviewPrologue } from "@/components/review/review-prologue";
import { PanelTabButton, type ReviewTab, ReviewTopBar } from "@/components/review/review-top-bar";
import { Button } from "@/components/ui/button";
import type {
  ReviewChapter,
  ReviewCommit,
  ReviewIssueComment,
  ReviewPrMeta,
} from "@/lib/review-api";
import { setFileViewed } from "@/lib/review-api";
import {
  DEFAULT_REVIEW_PREFERENCES,
  readReviewPreferences,
  type ReviewPreferences,
} from "@/lib/review-preferences";
import { cn } from "@/lib/utils";
import type { Prologue } from "@folio/types";

import { useKeyChangeJump } from "./use-key-change-jump";

type ChapterPanelTab = "chapters" | "activity";

export function ReviewView({
  pr,
  prologue,
  chapters,
  comments,
  commits,
  commitsTruncated,
  initialChapterIndex,
}: {
  pr: ReviewPrMeta;
  prologue: Prologue | null;
  chapters: ReviewChapter[];
  comments: ReviewIssueComment[];
  commits: ReviewCommit[];
  commitsTruncated: boolean;
  initialChapterIndex?: number;
}) {
  const [tab, setTab] = useState<ReviewTab>("chapters");
  const [chapterPanelTab, setChapterPanelTab] = useState<ChapterPanelTab>("chapters");
  const [reviewChapters, setReviewChapters] = useState(chapters);
  // null = the graph+cards overview; a number = that chapter's in-place diff review.
  const [openIndex, setOpenIndex] = useState<number | null>(initialChapterIndex ?? null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [filesTabQuery, setFilesTabQuery] = useState("");
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("split");
  const [preferences, setPreferences] = useState<ReviewPreferences>(DEFAULT_REVIEW_PREFERENCES);
  const [collapsedFiles, setCollapsedFiles] = useState(() => viewedFileCollapseState(chapters));

  useEffect(() => {
    setReviewChapters(chapters);
    setCollapsedFiles(viewedFileCollapseState(chapters));
  }, [chapters]);

  useEffect(() => {
    setOpenIndex(initialChapterIndex ?? null);
  }, [initialChapterIndex]);

  useEffect(() => {
    const stored = readReviewPreferences();
    setPreferences(stored);
    setDiffViewMode(stored.diffLayout);
  }, []);

  const files = aggregateChangedFiles(reviewChapters);
  const fileProgressValue = fileProgress(files);
  const chapterProgressValue = chapterMilestoneProgress(reviewChapters);
  // Keep Files-tab selection inside the filtered set (query may hide the prior path).
  const resolvedSelectedPath = useMemo(
    () => resolveSelectedFilePath(files, filesTabQuery, selectedFilePath),
    [files, filesTabQuery, selectedFilePath],
  );
  const selectedFile = useMemo(
    () => files.find((file) => file.path === resolvedSelectedPath) ?? null,
    [files, resolvedSelectedPath],
  );
  // First incomplete chapter is the overview "continue" target.
  const continueChapter = useMemo(
    () => reviewChapters.find((chapter) => !chapter.viewed) ?? null,
    [reviewChapters],
  );
  const selectedFileChapter = selectedFile
    ? reviewChapters.find((chapter) => chapter.index === selectedFile.chapterIndex)
    : null;
  const selectedFileScopedChapter =
    selectedFile && selectedFileChapter
      ? buildFileScopedChapter(selectedFileChapter, selectedFile.path)
      : null;
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  const openChapter =
    openIndex === null ? null : (reviewChapters.find((c) => c.index === openIndex) ?? null);
  const { handleJumpToKeyChange, jumpNotice, jumpTarget, activeKeyChangeId, focusMarkers } =
    useKeyChangeJump(openChapter, setCollapsedFiles);
  const openChapterPosition = openChapter
    ? reviewChapters.findIndex((chapter) => chapter.index === openChapter.index)
    : -1;
  const nextChapter = reviewChapters[openChapterPosition + 1];
  const prevChapter = openChapterPosition > 0 ? reviewChapters[openChapterPosition - 1] : undefined;
  const prPath = `/${pr.org}/${pr.repo}/pull/${pr.number}`;
  const openChapterFilePaths = openChapter?.files.map((file) => file.path) ?? [];
  const allOpenChapterFilesCollapsed = areFilePathsCollapsed(collapsedFiles, openChapterFilePaths);

  const navigateChapter = useCallback(
    (direction: "previous" | "next") => {
      if (openChapterPosition < 0) {
        return;
      }

      const offset = direction === "previous" ? -1 : 1;
      const targetChapter = reviewChapters[openChapterPosition + offset];
      if (targetChapter) {
        setOpenIndex(targetChapter.index);
      }
    },
    [openChapterPosition, reviewChapters],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const shortcut = getChapterNavigationShortcut(event);
      if (!shortcut || tab !== "chapters" || openChapterPosition < 0) {
        return;
      }

      // Keep brackets available while a reviewer is typing a search or comment.
      event.preventDefault();
      navigateChapter(shortcut);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigateChapter, openChapterPosition, tab]);

  async function updateFileViewed(path: string, viewed: boolean) {
    setReviewChapters((prev) =>
      prev.map((chapter) => ({
        ...chapter,
        files: chapter.files.map((file) => (file.path === path ? { ...file, viewed } : file)),
      })),
    );
    setCollapsedFiles((current) => setFilePathsCollapsed(current, [path], viewed));
    try {
      await setFileViewed(pr.org, pr.repo, pr.number, path, viewed);
    } catch {
      setReviewChapters((prev) =>
        prev.map((chapter) => ({
          ...chapter,
          files: chapter.files.map((file) =>
            file.path === path ? { ...file, viewed: !viewed } : file,
          ),
        })),
      );
      setCollapsedFiles((current) => setFilePathsCollapsed(current, [path], !viewed));
    }
  }

  function updateFileCollapsed(path: string, collapsed: boolean) {
    setCollapsedFiles((current) => setFilePathsCollapsed(current, [path], collapsed));
  }

  function toggleAllOpenChapterFiles() {
    setCollapsedFiles((current) =>
      setFilePathsCollapsed(current, openChapterFilePaths, !allOpenChapterFilesCollapsed),
    );
  }

  function updateKeyChangeViewed(chapterIndex: number, keyChangeId: string, viewed: boolean) {
    setReviewChapters((prev) =>
      prev.map((chapter) =>
        chapter.index === chapterIndex
          ? {
              ...chapter,
              keyChanges: chapter.keyChanges.map((item) =>
                item.id === keyChangeId ? { ...item, viewed } : item,
              ),
            }
          : chapter,
      ),
    );
  }

  function updateChapterViewed(chapterIndex: number, viewed: boolean) {
    setReviewChapters((prev) =>
      prev.map((chapter) => (chapter.index === chapterIndex ? { ...chapter, viewed } : chapter)),
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        preferences.textSize === "default" && "review-text-default",
      )}
    >
      <ReviewTopBar
        pr={pr}
        activeTab={tab}
        onTabChange={setTab}
        chapterCount={reviewChapters.length}
        fileCount={files.length}
        viewedChapters={chapterProgressValue.done}
        totalChapters={chapterProgressValue.total}
        viewedFiles={fileProgressValue.viewed}
        totalFiles={fileProgressValue.total}
        totalAdditions={totalAdditions}
        totalDeletions={totalDeletions}
      />

      {tab === "chapters" ? (
        openChapter ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Sticky strip keeps chapter controls visible while the diff scrolls. */}
            <div className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b bg-background/95 px-4 py-2.5 backdrop-blur-sm md:px-6">
              <Button variant="ghost" size="sm" onClick={() => setOpenIndex(null)}>
                <ChevronLeft className="size-4" />
                개요
              </Button>
              <span className="truncate">
                <span className="font-mono text-xs text-muted-foreground">
                  제{openChapter.index}장 ·{" "}
                </span>
                <span className="font-sans text-base font-medium text-foreground">
                  {openChapter.title}
                </span>
              </span>
              <div className="ml-auto flex items-center gap-1">
                <DiffViewModeSwitch value={diffViewMode} onChange={setDiffViewMode} />
                <Button variant="outline" size="sm" onClick={toggleAllOpenChapterFiles}>
                  {allOpenChapterFilesCollapsed ? (
                    <ChevronsDown className="size-4" />
                  ) : (
                    <ChevronsUp className="size-4" />
                  )}
                  {allOpenChapterFilesCollapsed ? "모두 펴기" : "모두 접기"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  disabled={!prevChapter}
                  onClick={() => navigateChapter("previous")}
                  aria-label="이전 장"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  disabled={!nextChapter}
                  onClick={() => navigateChapter("next")}
                  aria-label="다음 장"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <div
              className={cn(
                "grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px]",
                preferences.chapterPanel === "left" &&
                  "lg:grid-cols-[380px_minmax(0,1fr)] lg:[&>aside]:order-first",
              )}
            >
              <DiffViewer
                chapter={openChapter}
                collapsedFiles={collapsedFiles}
                focusMarkers={focusMarkers}
                jumpTarget={jumpTarget}
                viewMode={diffViewMode}
                onFileViewedChange={updateFileViewed}
                onFileCollapseChange={updateFileCollapsed}
                commentContext={{
                  org: pr.org,
                  repo: pr.repo,
                  number: pr.number,
                  chapterIndex: openChapter.index,
                }}
              />
              <ChapterPanel
                chapters={reviewChapters}
                activeIndex={openChapter.index}
                prPath={prPath}
                org={pr.org}
                repo={pr.repo}
                number={pr.number}
                showReviewFocus={preferences.showReviewFocus}
                onKeyChangeViewedChange={updateKeyChangeViewed}
                onChapterViewedChange={updateChapterViewed}
                onSelectChapter={setOpenIndex}
                onJumpToKeyChange={handleJumpToKeyChange}
                activeKeyChangeId={activeKeyChangeId}
                jumpNotice={jumpNotice}
              />
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-8 md:py-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-8">
              <section className="min-w-0">
                <ReviewPrologue pr={pr} prologue={prologue} comments={comments} />
              </section>
              <section className="min-w-0">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    리뷰
                  </h2>
                  <div className="flex rounded-lg bg-muted/60 p-1">
                    <PanelTabButton
                      active={chapterPanelTab === "chapters"}
                      label={`챕터 ${reviewChapters.length}`}
                      onClick={() => setChapterPanelTab("chapters")}
                    />
                    <PanelTabButton
                      active={chapterPanelTab === "activity"}
                      label={`활동 ${commits.length}${commitsTruncated ? "+" : ""}`}
                      onClick={() => setChapterPanelTab("activity")}
                    />
                  </div>
                </div>
                {chapterPanelTab === "chapters" ? (
                  <div className="space-y-4">
                    {continueChapter ? (
                      <button
                        type="button"
                        onClick={() => setOpenIndex(continueChapter.index)}
                        className="flex w-full items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-left transition-colors hover:bg-primary/15"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-primary text-xs">이어서 리뷰</div>
                          <div className="mt-0.5 truncate text-sm text-foreground">
                            제{continueChapter.index}장 · {continueChapter.title}
                          </div>
                        </div>
                        <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground text-xs">
                          계속
                          <ArrowRight className="size-3.5" />
                        </span>
                      </button>
                    ) : null}
                    <ChapterCards chapters={reviewChapters} onSelect={setOpenIndex} />
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card p-2">
                    <CommitGraph commits={commits} pr={pr} />
                  </div>
                )}
              </section>
            </div>
          </div>
        )
      ) : (
        <ReviewFilesTab
          pr={pr}
          files={files}
          filesTabQuery={filesTabQuery}
          onFilesTabQueryChange={setFilesTabQuery}
          selectedFile={selectedFile}
          selectedFileScopedChapter={selectedFileScopedChapter}
          collapsedFiles={collapsedFiles}
          diffViewMode={diffViewMode}
          onDiffViewModeChange={setDiffViewMode}
          onSelectFile={setSelectedFilePath}
          onFileViewedChange={updateFileViewed}
          onFileCollapseChange={updateFileCollapsed}
        />
      )}
    </div>
  );
}
